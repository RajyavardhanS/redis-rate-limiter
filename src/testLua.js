const Redis = require('ioredis')
const fs = require('fs')
const path = require('path')

const redis = new Redis()

const script = fs.readFileSync(
  path.join(__dirname, 'scripts', 'tokenBucket.lua'),
  'utf8'
)

async function main() {
  await redis.del('rl:user:1')

  const capacity = 3
  const refillRate = 1  // 1 token per second
  const key = 'rl:user:1'

  console.log('--- Firing 5 requests concurrently (race condition test) ---')
  
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      redis.eval(script, 1, key, capacity, refillRate, Date.now(), 1)
    )
  )

  results.forEach(([allowed, remaining, resetMs], i) => {
    console.log(
      `Request ${i + 1}: ${allowed === 1 ? '✅ allowed' : '❌ blocked'} | remaining: ${remaining} | retryAfter: ${resetMs}ms`
    )
  })

  const allowedCount = results.filter(([allowed]) => allowed === 1).length
  console.log(`\nAllowed: ${allowedCount} out of 5 (limit was ${capacity})`)

  redis.disconnect()
}

main()