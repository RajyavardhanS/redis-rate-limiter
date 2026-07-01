import { useState, useEffect, useRef } from 'react'

export default function LiveFeed({ socket }) {
  const [feed, setFeed] = useState([])
  const [userId, setUserId] = useState('user-1')
  const [algorithm, setAlgorithm] = useState('tokenBucket')
  const [firing, setFiring] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    socket.on('feed:update', (data) => {
      setFeed(prev => [...prev, data].slice(-50))
    })

    return () => socket.off('feed:update')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed])

  const sendOne = () => {
    socket.emit('feed:request', { userId, algorithm })
  }

  const sendBurst = async () => {
    setFiring(true)
    for (let i = 0; i < 10; i++) {
      socket.emit('feed:request', { userId, algorithm })
      await new Promise(r => setTimeout(r, 100))
    }
    setFiring(false)
  }

  const algorithmColors = {
    tokenBucket: 'text-blue-400',
    slidingWindowLog: 'text-purple-400',
    slidingWindowCounter: 'text-emerald-400',
  }

  const algorithmLabels = {
    tokenBucket: 'Token Bucket',
    slidingWindowLog: 'Sliding Log',
    slidingWindowCounter: 'Sliding Counter',
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="bg-gray-900 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-2">Live Request Feed</h2>
        <p className="text-gray-400 text-sm">
          Fire real requests and watch them flow through the rate limiter in real time.
          Open this in multiple browser tabs — all tabs share the same feed via WebSockets.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 rounded-2xl p-6 flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-sm">User ID</label>
          <input
            type="text"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm w-40 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-sm">Algorithm</label>
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="tokenBucket">Token Bucket</option>
            <option value="slidingWindowLog">Sliding Window Log</option>
            <option value="slidingWindowCounter">Sliding Window Counter</option>
          </select>
        </div>

        <div className="flex gap-3 ml-auto">
          <button
            onClick={sendOne}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold transition-colors"
          >
            Send 1
          </button>
          <button
            onClick={sendBurst}
            disabled={firing}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition-colors"
          >
            {firing ? 'Firing...' : 'Send Burst (10)'}
          </button>
          <button
            onClick={() => setFeed([])}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-semibold transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {feed.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Total Requests</p>
            <p className="text-white text-2xl font-black">{feed.length}</p>
          </div>
          <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Allowed</p>
            <p className="text-green-400 text-2xl font-black">
              {feed.filter(r => r.allowed).length}
            </p>
          </div>
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Blocked</p>
            <p className="text-red-400 text-2xl font-black">
              {feed.filter(r => !r.allowed).length}
            </p>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-2 max-h-96 overflow-y-auto">
        {feed.length === 0 && (
          <p className="text-gray-600 text-sm">No requests yet. Send one above.</p>
        )}
        {feed.map((entry, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 p-3 rounded-xl text-sm border ${
              entry.allowed
                ? 'bg-green-900/20 border-green-900'
                : 'bg-red-900/20 border-red-900'
            }`}
          >
            <span className={entry.allowed ? 'text-green-400' : 'text-red-400'}>
              {entry.allowed ? '✅' : '❌'}
            </span>
            <span className="text-gray-300 font-mono text-xs">{entry.userId}</span>
            <span className={`text-xs font-semibold ${algorithmColors[entry.algorithm]}`}>
              {algorithmLabels[entry.algorithm]}
            </span>
            <span className="text-gray-500 text-xs">
              {entry.allowed ? `${entry.remaining} remaining` : `retry in ${entry.resetMs}ms`}
            </span>
            <span className="text-gray-700 text-xs ml-auto">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

    </div>
  )
}