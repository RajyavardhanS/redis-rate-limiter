const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SCRIPTS = {
  tokenBucket: fs.readFileSync(
    path.join(__dirname, 'scripts', 'tokenBucket.lua'),
    'utf8'
  ),
  slidingWindowLog: fs.readFileSync(
    path.join(__dirname, 'scripts', 'slidingWindowLog.lua'),
    'utf8'
  ),
  slidingWindowCounter: fs.readFileSync(
    path.join(__dirname, 'scripts', 'slidingWindowCounter.lua'),
    'utf8'
  ),
}

class RateLimitError extends Error {
  constructor(message, { retryAfterMs } = {}) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

class RateLimiter {
  constructor({ redisClient, algorithm = 'tokenBucket', points, duration, keyPrefix = 'rl' }) {
    if (!redisClient) throw new Error('redisClient is required')
    if (!points || !duration) throw new Error('points and duration are required')
    if (!SCRIPTS[algorithm]) throw new Error(`Unknown algorithm: ${algorithm}`)

    this.redis = redisClient
    this.algorithm = algorithm
    this.points = points
    this.duration = duration
    this.keyPrefix = keyPrefix
    this.windowMs = duration * 1000
  }

  _key(identifier) {
    return `${this.keyPrefix}:${this.algorithm}:${identifier}`
  }

  async consume(identifier, cost = 1) {
    const now = Date.now()
    let result

    switch (this.algorithm) {
      case 'tokenBucket': {
        const refillRate = this.points / this.duration
        result = await this.redis.eval(
          SCRIPTS.tokenBucket,
          1,
          this._key(identifier),
          this.points,
          refillRate,
          now,
          cost
        )
        break
      }

      case 'slidingWindowLog': {
        const requestId = `${now}-${crypto.randomBytes(6).toString('hex')}`
        result = await this.redis.eval(
          SCRIPTS.slidingWindowLog,
          1,
          this._key(identifier),
          this.points,
          this.windowMs,
          now,
          requestId
        )
        break
      }

      case 'slidingWindowCounter': {
        const currentWindowStart = now - (now % this.windowMs)
        const previousWindowStart = currentWindowStart - this.windowMs
        const currentKey = `${this._key(identifier)}:${currentWindowStart}`
        const previousKey = `${this._key(identifier)}:${previousWindowStart}`
        result = await this.redis.eval(
          SCRIPTS.slidingWindowCounter,
          2,
          currentKey,
          previousKey,
          this.points,
          this.windowMs,
          now
        )
        break
      }
    }

    const [allowed, remaining, resetMs] = result

    return {
      allowed: allowed === 1,
      remaining: Number(remaining),
      resetMs: Number(resetMs),
    }
  }

  async assert(identifier, cost = 1) {
    const result = await this.consume(identifier, cost)
    if (!result.allowed) {
      throw new RateLimitError(`Rate limit exceeded for "${identifier}"`, {
        retryAfterMs: result.resetMs,
      })
    }
    return result
  }

  middleware({ keyFn = (req) => req.ip } = {}) {
    return async (req, res, next) => {
      try {
        const identifier = keyFn(req)
        const result = await this.consume(identifier)

        res.set('X-RateLimit-Limit', String(this.points))
        res.set('X-RateLimit-Remaining', String(result.remaining))
        res.set('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)))

        if (!result.allowed) {
          res.set('Retry-After', String(Math.ceil(result.resetMs / 1000)))
          return res.status(429).json({
            error: 'Too Many Requests',
            retryAfterMs: result.resetMs,
          })
        }

        next()
      } catch (err) {
        console.error('[RateLimiter] Redis error, failing open:', err.message)
        next()
      }
    }
  }
}

module.exports = { RateLimiter, RateLimitError }