# Redis Rate Limiter

A production-ready distributed rate limiter built with Node.js and Redis. Implements three algorithms using atomic Lua scripts to eliminate race conditions, an Express middleware layer, and a real-time React visualizer built with Socket.io.

---

## The Problem This Solves

The naive approach to rate limiting has a race condition:

```js
const count = await redis.get(key)   // Step 1: Read
if (count >= limit) return blocked
await redis.incr(key)                // Step 2: Write ← gap here
```

Under concurrent load, two requests both read before either writes back — both see a count below the limit and both get through. This was proven by firing 10 concurrent requests at a limit of 5 using `Promise.all` — all 10 got through.

**The fix:** Lua scripts run as a single atomic operation inside Redis. Nothing can interrupt them. The same 10 concurrent requests through the Lua-backed implementation — exactly 5 get through.

---

## Algorithms

| Algorithm | Memory | Precision | Best for |
|---|---|---|---|
| Token Bucket | O(1) | Approximate | General APIs, allows bursts |
| Sliding Window Log | O(limit) | Exact | Auth endpoints, strict limits |
| Sliding Window Counter | O(1) | Near-exact | High-throughput, memory-sensitive |

### Token Bucket
Stores `tokens` and `lastRefill` in a Redis hash. On each request, calculates how many tokens refilled since the last call, caps at capacity, then deducts cost. Allows short bursts — a user can fire 5 requests instantly then must wait for refill.

### Sliding Window Log
Stores every request timestamp in a Redis sorted set. On each request, prunes entries older than the window (`ZREMRANGEBYSCORE`), counts what's left (`ZCARD`), and adds the new timestamp (`ZADD`) if under limit. Perfectly precise — no boundary effects. Memory scales with the limit.

### Sliding Window Counter
Blends two fixed-window counters with a weighted average:
```
estimated = (previous_count × overlap_weight) + current_count
```
Very accurate in practice, O(1) memory. Slight imprecision at window boundaries is bounded and predictable.

---

## Tech Stack

| Category                | Technologies        |
| ----------------------- | ------------------- |
| Backend                 | Node.js, Express.js |
| Database / Cache        | Redis               |
| Scripting               | Lua                 |
| Redis Client            | ioredis             |
| Frontend                | React.js, Vite      |
| Styling                 | Tailwind CSS        |
| Real-time Communication | Socket.io           |
| Testing                 | Jest, ioredis-mock  |
| Package Manager         | npm                 |
| Version Control         | Git, GitHub         |


## Architecture

```
Browser (React)
    ↕ Socket.io WebSocket
Express Server (Node.js)
    ↕ redis.eval(luaScript)
Redis ← Lua script runs atomically here
```

**Why this matters:** multiple Node.js instances behind a load balancer all share the same Redis — one source of truth for all counters. In-memory rate limiters can't do this.

---

## Project Structure

```
redis-rate-limiter/
├── src/
│   ├── index.js                       # RateLimiter class, RateLimitError
│   └── scripts/
│       ├── tokenBucket.lua            # Token bucket algorithm
│       ├── slidingWindowLog.lua       # Exact sliding window (sorted set)
│       └── slidingWindowCounter.lua   # Approximate sliding window (counters)
├── test/
│   └── rateLimiter.test.js            # 19 tests, uses ioredis-mock
├── examples/
│   ├── server.js                      # Express + Socket.io backend
│   └── frontend/                      # React + Tailwind visualizer
│       └── src/
│           ├── App.jsx
│           └── components/
│               ├── TokenBucket.jsx        # Animated bucket demo
│               ├── RaceCondition.jsx      # Side-by-side race condition replay
│               ├── AlgorithmComparison.jsx # Compare all 3 algorithms
│               └── LiveFeed.jsx           # Real-time request log
└── package.json
```

---

## Getting Started

**Prerequisites:** Node.js, Redis (see setup below)

```bash
git clone https://github.com/yourusername/redis-rate-limiter
cd redis-rate-limiter
npm install
```

**Redis on WSL2 (Windows):**
```bash
sudo apt install redis -y
sudo service redis-server start
redis-cli ping   # should return PONG
```

**Start the backend:**
```bash
node examples/server.js
```

**Start the visualizer (separate terminal):**
```bash
cd examples
npm run dev
```

Open `http://localhost:5173`

---

## Usage

### Basic
```js
const Redis = require('ioredis')
const { RateLimiter } = require('./src/index')

const redis = new Redis()

const limiter = new RateLimiter({
  redisClient: redis,
  algorithm: 'tokenBucket',   // 'tokenBucket' | 'slidingWindowLog' | 'slidingWindowCounter'
  points: 10,                 // max requests
  duration: 60,               // per 60 seconds
  keyPrefix: 'rl',            // optional namespace
})

const result = await limiter.consume('user:123')
// { allowed: true, remaining: 9, resetMs: 0 }
```

### As Express middleware
```js
// Limit by IP (default)
app.use(limiter.middleware())

// Limit by user ID
app.use(limiter.middleware({ keyFn: (req) => req.user.id }))

// Limit by API key from header
app.use(limiter.middleware({ keyFn: (req) => req.headers['x-api-key'] }))
```

Response headers set automatically:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 42
Retry-After: 42       ← only on 429 responses
```

### Throw on limit exceeded
```js
const { RateLimitError } = require('./src/index')

try {
  await limiter.assert('user:123')
  // proceed normally
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Retry in ${err.retryAfterMs}ms`)
  }
}
```

---

## Tests

```bash
npm test
```

Tests use **ioredis-mock** — a fake in-memory Redis. No real Redis server needed. This means tests run anywhere: locally, in CI/CD pipelines, on a colleague's machine without any setup.

**Why both real Redis AND ioredis-mock?**
- Real Redis: used by the running application. Every click in the visualizer hits real Redis via real Lua scripts.
- ioredis-mock: used only in tests so they run fast, in isolation, without infrastructure dependencies.

```
Test Suites: 1 passed
Tests:       19 passed
```

Coverage:
- Constructor validation (missing config, unknown algorithm)
- All three algorithms under sequential and concurrent load
- `assert()` throwing `RateLimitError` with `retryAfterMs`
- Middleware setting correct headers and returning 429
- Fail-open behavior when Redis is unreachable

---

## Design Decisions

**Fail-open middleware:** if Redis goes down, the middleware logs the error and calls `next()` instead of returning 429. A Redis outage degrades to "no rate limiting" rather than a complete API outage. Availability over strict enforcement.

**Lua over MULTI/EXEC:** Redis transactions (MULTI/EXEC) queue commands but don't prevent other clients from reading between them. Lua scripts run entirely on the Redis server as one atomic block — simpler and no retry logic needed on the client side.

**TTL on all keys:** every key has an expiry. Token bucket TTL = time to fully refill from empty. Sliding window keys expire after the window duration. Idle keys never accumulate in Redis.

---

## Stack

Node.js · Redis · ioredis · Lua · Express · Socket.io · React · Tailwind CSS · Vite · Jest · ioredis-mock
