const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const Redis = require('ioredis')
const path = require('path')
const { RateLimiter } = require('../src/index')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const redis = new Redis()

// Three limiters, one per algorithm
const limiters = {
  tokenBucket: new RateLimiter({
    redisClient: redis,
    algorithm: 'tokenBucket',
    points: 5,
    duration: 10,
    keyPrefix: 'demo',
  }),
  slidingWindowLog: new RateLimiter({
    redisClient: redis,
    algorithm: 'slidingWindowLog',
    points: 5,
    duration: 10,
    keyPrefix: 'demo',
  }),
  slidingWindowCounter: new RateLimiter({
    redisClient: redis,
    algorithm: 'slidingWindowCounter',
    points: 5,
    duration: 10,
    keyPrefix: 'demo',
  }),
}

// When a client connects via WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // Tab 1: Token bucket — single request
  socket.on('tokenBucket:request', async ({ userId }) => {
    const result = await limiters.tokenBucket.consume(userId)
    socket.emit('tokenBucket:result', {
      ...result,
      userId,
      timestamp: Date.now(),
    })
  })

  // Tab 1: Reset the bucket
  socket.on('tokenBucket:reset', async ({ userId }) => {
    await redis.del(`demo:tokenBucket:${userId}`)
    socket.emit('tokenBucket:reset:done')
  })

  // Tab 2: Race condition demo — naive version (broken)
  socket.on('race:naive', async ({ userId }) => {
    await redis.del(`naive:${userId}`)
    const steps = []

    // Simulate two requests reading before either writes
    const key = `naive:${userId}`

    // Both read at the same time
    const val1 = await redis.get(key)
    const val2 = await redis.get(key)
    steps.push({ request: 'A', action: 'GET', value: val1, note: 'reads null — under limit' })
    steps.push({ request: 'B', action: 'GET', value: val2, note: 'also reads null — under limit' })

    // Both write
    await redis.incr(key)
    steps.push({ request: 'A', action: 'INCR', value: '1', note: 'increments to 1' })
    await redis.incr(key)
    steps.push({ request: 'B', action: 'INCR', value: '2', note: 'increments to 2' })

    steps.push({ request: '⚠️', action: 'RESULT', value: 'BOTH ALLOWED', note: 'both got through even with limit of 1' })

    socket.emit('race:naive:result', { steps })
  })

  // Tab 2: Race condition demo — Lua fix (correct)
  socket.on('race:lua', async ({ userId }) => {
    await redis.del(`demo:tokenBucket:${userId}`)
    const steps = []

    // Fire two concurrent requests through the real limiter
    const [r1, r2] = await Promise.all([
      limiters.tokenBucket.consume(userId),
      limiters.tokenBucket.consume(userId),
    ])

    steps.push({ request: 'A', action: 'EVAL (atomic)', value: r1.allowed ? 'ALLOWED' : 'BLOCKED', note: 'Lua reads and writes atomically' })
    steps.push({ request: 'B', action: 'EVAL (atomic)', value: r2.allowed ? 'ALLOWED' : 'BLOCKED', note: 'waits for A to finish before executing' })

    const allowedCount = [r1, r2].filter(r => r.allowed).length
    steps.push({
      request: '✅',
      action: 'RESULT',
      value: `${allowedCount}/2 ALLOWED`,
      note: 'Lua script prevented the race condition'
    })

    socket.emit('race:lua:result', { steps })
  })

  // Tab 3: Algorithm comparison — fire N concurrent requests at all three
  socket.on('compare:run', async ({ userId, count }) => {
    // Reset all three first
    await redis.del(`demo:tokenBucket:${userId}`)
    await redis.del(`demo:slidingWindowLog:${userId}`)
    await redis.del(`demo:slidingWindowCounter:${userId}`)

    const run = async (algorithm) => {
      const results = await Promise.all(
        Array.from({ length: count }, () => limiters[algorithm].consume(userId))
      )
      return {
        algorithm,
        allowed: results.filter(r => r.allowed).length,
        blocked: results.filter(r => !r.allowed).length,
        results: results.map(r => ({ allowed: r.allowed, remaining: r.remaining })),
      }
    }

    const [tb, swl, swc] = await Promise.all([
      run('tokenBucket'),
      run('slidingWindowLog'),
      run('slidingWindowCounter'),
    ])

    socket.emit('compare:result', { tokenBucket: tb, slidingWindowLog: swl, slidingWindowCounter: swc })
  })

  // Tab 4: Live feed — fire a request through a chosen algorithm
  socket.on('feed:request', async ({ userId, algorithm }) => {
    const result = await limiters[algorithm].consume(userId)
    // Broadcast to ALL connected clients so multiple browser tabs see the same feed
    io.emit('feed:update', {
      userId,
      algorithm,
      ...result,
      timestamp: Date.now(),
    })
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})