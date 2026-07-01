import { useState } from 'react'

export default function AlgorithmComparison({ socket }) {
  const [count, setCount] = useState(8)
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)

  const run = () => {
    setResults(null)
    setRunning(true)

    socket.emit('compare:run', { userId: 'compare-demo', count })

    socket.once('compare:result', (data) => {
      setResults(data)
      setRunning(false)
    })
  }

  const algorithms = [
    {
      key: 'tokenBucket',
      label: 'Token Bucket',
      color: 'blue',
      description: 'Allows bursts up to capacity, refills continuously over time.',
      pro: 'Handles traffic spikes gracefully',
      con: 'Slightly complex to reason about',
    },
    {
      key: 'slidingWindowLog',
      label: 'Sliding Window Log',
      color: 'purple',
      description: 'Stores every request timestamp. Exact count within any window.',
      pro: 'Perfectly precise',
      con: 'Higher memory usage (stores all timestamps)',
    },
    {
      key: 'slidingWindowCounter',
      label: 'Sliding Window Counter',
      color: 'emerald',
      description: 'Blends current and previous window counts using a weighted average.',
      pro: 'Memory efficient, very accurate',
      con: 'Slightly approximate at window boundaries',
    },
  ]

  const colorMap = {
    blue: {
      border: 'border-blue-700',
      bg: 'bg-blue-900/30',
      text: 'text-blue-400',
      bar: 'bg-blue-500',
      blockedBar: 'bg-blue-900',
      badge: 'bg-blue-600',
    },
    purple: {
      border: 'border-purple-700',
      bg: 'bg-purple-900/30',
      text: 'text-purple-400',
      bar: 'bg-purple-500',
      blockedBar: 'bg-purple-900',
      badge: 'bg-purple-600',
    },
    emerald: {
      border: 'border-emerald-700',
      bg: 'bg-emerald-900/30',
      text: 'text-emerald-400',
      bar: 'bg-emerald-500',
      blockedBar: 'bg-emerald-900',
      badge: 'bg-emerald-600',
    },
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div className="bg-gray-900 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-2">Algorithm Comparison</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          Fire the same batch of concurrent requests at all three algorithms simultaneously.
          All are configured with a limit of <span className="text-white font-semibold">5 requests</span>.
          See how each one handles the load.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 rounded-2xl p-6 flex items-center gap-6">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-sm">Concurrent requests to fire</label>
          <input
            type="range"
            min={3}
            max={15}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            className="w-48 accent-blue-500"
          />
          <span className="text-white font-bold text-lg">{count} requests</span>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors ml-auto"
        >
          {running ? 'Running...' : '🚀 Fire Requests'}
        </button>
      </div>

      {/* Algorithm cards */}
      <div className="grid grid-cols-3 gap-6">
        {algorithms.map(algo => {
          const c = colorMap[algo.color]
          const data = results?.[algo.key]
          const allowedPct = data ? (data.allowed / count) * 100 : 0
          const blockedPct = data ? (data.blocked / count) * 100 : 0

          return (
            <div key={algo.key} className={`bg-gray-900 rounded-2xl p-6 border ${c.border} flex flex-col gap-4`}>
              <div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c.badge}`}>
                  {algo.label}
                </span>
                <p className="text-gray-400 text-sm mt-3 leading-relaxed">{algo.description}</p>
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <p className="text-green-400">✅ {algo.pro}</p>
                <p className="text-red-400">⚠️ {algo.con}</p>
              </div>

              {/* Results */}
              {data ? (
                <div className="flex flex-col gap-3 mt-2">
                  {/* Bar */}
                  <div className="w-full h-4 rounded-full overflow-hidden bg-gray-800 flex">
                    <div
                      className={`${c.bar} transition-all duration-700`}
                      style={{ width: `${allowedPct}%` }}
                    />
                    <div
                      className="bg-red-800 transition-all duration-700"
                      style={{ width: `${blockedPct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-green-400 font-bold">✅ {data.allowed} allowed</span>
                    <span className="text-red-400 font-bold">❌ {data.blocked} blocked</span>
                  </div>

                  {/* Per request dots */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.results.map((r, i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          r.allowed ? 'bg-green-700 text-green-200' : 'bg-red-900 text-red-300'
                        }`}
                        title={r.allowed ? `Allowed, ${r.remaining} remaining` : 'Blocked'}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="w-full h-4 rounded-full bg-gray-800" />
                  <p className="text-gray-600 text-sm">Fire requests to see results.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}