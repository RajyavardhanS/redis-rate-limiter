local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local request_id = ARGV[4]

local window_start = now - window_ms

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local current_count = redis.call('ZCARD', key)

if current_count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_ms = window_ms
  if oldest[2] then
    reset_ms = window_ms - (now - tonumber(oldest[2]))
  end
  return { 0, 0, reset_ms }
end

redis.call('ZADD', key, now, request_id)
redis.call('PEXPIRE', key, window_ms)

local remaining = limit - current_count - 1

return { 1, remaining, window_ms }