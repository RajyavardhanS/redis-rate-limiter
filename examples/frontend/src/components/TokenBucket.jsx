import { useState, useEffect } from 'react'

export default function TokenBucket({ socket }) {
  const [tokens, setTokens] = useState(5)
  const [capacity] = useState(5)
  const [log, setLog] = useState([])
  const [userId] = useState('demo-user')

  // Slowly refill tokens visually between requests
  useEffect(() => {
    const interval = setInterval(() => {
      setTokens(prev => Math.min(capacity, prev + (capacity / (10 * 10))))
    }, 100)
    return () => clearInterval(interval)
  }, [capacity])

  useEffect(() => {
    socket.on('tokenBucket:result', (data) => {
      setTokens(data.remaining)
      setLog(prev => [{
        allowed: data.allowed,
        remaining: data.remaining,
        resetMs: data.resetMs,
        time: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 10))
    })

    socket.on('tokenBucket:reset:done', () => {
      setTokens(capacity)
      setLog([])
    })

    return () => {
      socket.off('tokenBucket:result')
      socket.off('tokenBucket:reset:done')
    }
  }, [])

  const sendRequest = () => {
    socket.emit('tokenBucket:request', { userId })
  }

  const reset = () => {
    socket.emit('tokenBucket:reset', { userId })
  }

  const fillPercent = (tokens / capacity) * 100

  return (
    <div className="grid grid-cols-2 gap-8">

      {/* Left: Bucket visualization */}
      <div className="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-6">
        <h2 className="text-xl font-bold text-white">Token Bucket</h2>
        <p className="text-gray-400 text-sm text-center">
          Each request costs 1 token. Tokens refill over time.
          If the bucket is empty, the request is blocked.
        </p>

        {/* Bucket */}
        <div className="relative w-40 h-56 border-4 border-blue-500 rounded-b-3xl rounded-t-sm bg-gray-800 overflow-hidden">
          {/* Water — grows from bottom */}
          <div
            className="absolute left-0 right-0 bottom-0 transition-all duration-700"
            style={{
              height: `${fillPercent}%`,
              background: fillPercent > 50
                ? 'linear-gradient(to top, #1d4ed8, #3b82f6)'
                : fillPercent > 20
                ? 'linear-gradient(to top, #d97706, #f59e0b)'
                : 'linear-gradient(to top, #b91c1c, #ef4444)',
            }}
          />
          {/* Token count on top */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-4xl font-black text-white drop-shadow-lg">
              {Math.floor(tokens)}
            </span>
          </div>
        </div>

        <p className="text-gray-400 text-sm">{Math.floor(tokens)} / {capacity} tokens</p>

        {/* Refill progress bar */}
        <div className="w-full flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Refilling...</span>
            <span>{Math.round(fillPercent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-100"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={sendRequest}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-colors"
          >
            Send Request
          </button>
          <button
            onClick={reset}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Right: Request log */}
      <div className="bg-gray-900 rounded-2xl p-8 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white">Request Log</h2>

        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Allowed
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Blocked
          </span>
        </div>

        {log.length === 0 && (
          <p className="text-gray-500 text-sm">No requests yet. Click "Send Request".</p>
        )}

        <div className="flex flex-col gap-2">
          {log.map((entry, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-xl text-sm ${
                entry.allowed
                  ? 'bg-green-900/40 border border-green-700'
                  : 'bg-red-900/40 border border-red-700'
              }`}
            >
              <span className={entry.allowed ? 'text-green-400' : 'text-red-400'}>
                {entry.allowed ? '✅ Allowed' : '❌ Blocked'}
              </span>
              <span className="text-gray-400">
                {entry.allowed
                  ? `${Math.floor(entry.remaining)} tokens left`
                  : `retry in ${entry.resetMs}ms`}
              </span>
              <span className="text-gray-600 text-xs">{entry.time}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}