local current_key = KEYS[1]
local previous_key = KEYS[2]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local current_window_start = now - (now % window_ms)
local elapsed_in_current = now - current_window_start
local weight_previous = (window_ms - elapsed_in_current) / window_ms

local current_count = tonumber(redis.call('GET', current_key) or '0')
local previous_count = tonumber(redis.call('GET', previous_key) or '0')

local estimated_count = (previous_count * weight_previous) + current_count

if estimated_count >= limit then
  local reset_ms = window_ms - elapsed_in_current
  return { 0, 0, reset_ms }
end

local new_count = redis.call('INCR', current_key)
if new_count == 1 then
  redis.call('PEXPIRE', current_key, window_ms * 2)
end

local remaining = math.floor(limit - estimated_count - 1)
if remaining < 0 then remaining = 0 end

return { 1, remaining, window_ms - elapsed_in_current }