local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
end

local elapsed_seconds = math.max(0, (now - last_refill) / 1000)
local refilled = math.min(capacity, tokens + (elapsed_seconds * refill_rate))

local allowed = 0
local remaining = refilled

if refilled >= requested then
  allowed = 1
  remaining = refilled - requested
end

redis.call('HMSET', key, 'tokens', remaining, 'lastRefill', now)
local ttl_ms = math.ceil((capacity / refill_rate) * 1000) + 1000
redis.call('PEXPIRE', key, ttl_ms)

local reset_ms = 0
if allowed == 0 then
  local deficit = requested - refilled
  reset_ms = math.ceil((deficit / refill_rate) * 1000)
end

return { allowed, math.floor(remaining), reset_ms }