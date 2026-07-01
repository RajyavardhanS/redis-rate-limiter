const RedisMock = require('ioredis-mock')
const { RateLimiter, RateLimitError } = require('../src/index')

describe('RateLimiter', () => {
  let redis

  beforeEach(() => {
    redis = new RedisMock()
  })

  afterEach(async () => {
    await redis.flushall()
  })

  describe('constructor', () => {
    it('throws if redisClient is missing', () => {
      expect(() =>
        new RateLimiter({ algorithm: 'tokenBucket', points: 5, duration: 10 })
      ).toThrow('redisClient is required')
    })

    it('throws if points or duration missing', () => {
      expect(() =>
        new RateLimiter({ redisClient: redis, algorithm: 'tokenBucket', points: 5 })
      ).toThrow('points and duration are required')
    })

    it('throws on unknown algorithm', () => {
      expect(() =>
        new RateLimiter({ redisClient: redis, algorithm: 'unknown', points: 5, duration: 10 })
      ).toThrow('Unknown algorithm: unknown')
    })
  })

  describe('tokenBucket', () => {
    it('allows requests up to capacity then blocks', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 3,
        duration: 10,
      })

      const r1 = await limiter.consume('user:1')
      const r2 = await limiter.consume('user:1')
      const r3 = await limiter.consume('user:1')
      const r4 = await limiter.consume('user:1')

      expect(r1.allowed).toBe(true)
      expect(r2.allowed).toBe(true)
      expect(r3.allowed).toBe(true)
      expect(r4.allowed).toBe(false)
    })

    it('tracks remaining count correctly', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 3,
        duration: 10,
      })

      const r1 = await limiter.consume('user:2')
      const r2 = await limiter.consume('user:2')

      expect(r1.remaining).toBe(2)
      expect(r2.remaining).toBe(1)
    })

    it('tracks separate buckets per identifier', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 1,
        duration: 10,
      })

      const a = await limiter.consume('user:a')
      const b = await limiter.consume('user:b')

      expect(a.allowed).toBe(true)
      expect(b.allowed).toBe(true)
    })

    it('only allows limit requests under concurrent load', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 3,
        duration: 10,
      })

      const results = await Promise.all(
        Array.from({ length: 6 }, () => limiter.consume('user:3'))
      )

      const allowed = results.filter(r => r.allowed).length
      expect(allowed).toBe(3)
    })
  })

  describe('slidingWindowLog', () => {
    it('allows exactly points requests per window', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'slidingWindowLog',
        points: 3,
        duration: 10,
      })

      const r1 = await limiter.consume('user:1')
      const r2 = await limiter.consume('user:1')
      const r3 = await limiter.consume('user:1')
      const r4 = await limiter.consume('user:1')

      expect(r1.allowed).toBe(true)
      expect(r2.allowed).toBe(true)
      expect(r3.allowed).toBe(true)
      expect(r4.allowed).toBe(false)
    })

    it('only allows limit requests under concurrent load', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'slidingWindowLog',
        points: 3,
        duration: 10,
      })

      const results = await Promise.all(
        Array.from({ length: 6 }, () => limiter.consume('user:2'))
      )

      const allowed = results.filter(r => r.allowed).length
      expect(allowed).toBe(3)
    })

    it('tracks separate logs per identifier', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'slidingWindowLog',
        points: 1,
        duration: 10,
      })

      const a = await limiter.consume('user:a')
      const b = await limiter.consume('user:b')

      expect(a.allowed).toBe(true)
      expect(b.allowed).toBe(true)
    })
  })

  describe('slidingWindowCounter', () => {
    it('allows requests up to limit then blocks', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'slidingWindowCounter',
        points: 3,
        duration: 10,
      })

      const r1 = await limiter.consume('user:1')
      const r2 = await limiter.consume('user:1')
      const r3 = await limiter.consume('user:1')
      const r4 = await limiter.consume('user:1')

      expect(r1.allowed).toBe(true)
      expect(r2.allowed).toBe(true)
      expect(r3.allowed).toBe(true)
      expect(r4.allowed).toBe(false)
    })

    it('only allows limit requests under concurrent load', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'slidingWindowCounter',
        points: 3,
        duration: 10,
      })

      const results = await Promise.all(
        Array.from({ length: 6 }, () => limiter.consume('user:2'))
      )

      const allowed = results.filter(r => r.allowed).length
      expect(allowed).toBe(3)
    })
  })

  describe('assert()', () => {
    it('returns result when allowed', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 5,
        duration: 10,
      })

      const result = await limiter.assert('user:1')
      expect(result.allowed).toBe(true)
    })

    it('throws RateLimitError when blocked', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 1,
        duration: 10,
      })

      await limiter.assert('user:1')
      await expect(limiter.assert('user:1')).rejects.toThrow(RateLimitError)
    })

    it('includes retryAfterMs in the error', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 1,
        duration: 10,
      })

      await limiter.assert('user:1')

      try {
        await limiter.assert('user:1')
      } catch (err) {
        expect(err.retryAfterMs).toBeGreaterThan(0)
      }
    })
  })

  describe('middleware()', () => {
    it('calls next() when allowed', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 5,
        duration: 10,
      })

      const mw = limiter.middleware()
      const req = { ip: '127.0.0.1' }
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      await mw(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('returns 429 when blocked', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 1,
        duration: 10,
      })

      const mw = limiter.middleware()
      const req = { ip: '127.0.0.1' }
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      await mw(req, res, next)
      await mw(req, res, next)

      expect(res.status).toHaveBeenCalledWith(429)
    })

    it('fails open when redis throws', async () => {
      const brokenRedis = {
        eval: jest.fn().mockRejectedValue(new Error('connection refused')),
      }

      const limiter = new RateLimiter({
        redisClient: brokenRedis,
        algorithm: 'tokenBucket',
        points: 5,
        duration: 10,
      })

      const mw = limiter.middleware()
      const req = { ip: '127.0.0.1' }
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      await mw(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('uses custom keyFn', async () => {
      const limiter = new RateLimiter({
        redisClient: redis,
        algorithm: 'tokenBucket',
        points: 1,
        duration: 10,
      })

      const mw = limiter.middleware({ keyFn: (req) => req.headers['x-user-id'] })
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      // two different users, both should get through
      await mw({ headers: { 'x-user-id': 'user:a' } }, res, next)
      await mw({ headers: { 'x-user-id': 'user:b' } }, res, next)

      expect(next).toHaveBeenCalledTimes(2)
      expect(res.status).not.toHaveBeenCalled()
    })
  })

})