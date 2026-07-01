import { useState } from 'react'

export default function RaceCondition({ socket }) {
  const [naiveSteps, setNaiveSteps] = useState([])
  const [luaSteps, setLuaSteps] = useState([])
  const [naiveRunning, setNaiveRunning] = useState(false)
  const [luaRunning, setLuaRunning] = useState(false)

  const runNaive = () => {
    setNaiveSteps([])
    setNaiveRunning(true)

    socket.emit('race:naive', { userId: 'race-demo' })

    socket.once('race:naive:result', ({ steps }) => {
      // Reveal steps one by one with a delay so it feels like slow motion
      steps.forEach((step, i) => {
        setTimeout(() => {
          setNaiveSteps(prev => [...prev, step])
          if (i === steps.length - 1) setNaiveRunning(false)
        }, i * 600)
      })
    })
  }

  const runLua = () => {
    setLuaSteps([])
    setLuaRunning(true)

    socket.emit('race:lua', { userId: 'race-lua-demo' })

    socket.once('race:lua:result', ({ steps }) => {
      steps.forEach((step, i) => {
        setTimeout(() => {
          setLuaSteps(prev => [...prev, step])
          if (i === steps.length - 1) setLuaRunning(false)
        }, i * 600)
      })
    })
  }

  const StepCard = ({ step }) => {
    const isResult = step.action === 'RESULT'
    const isBad = step.value === 'BOTH ALLOWED'
    const isGood = step.value?.includes('1/2') || step.value?.includes('ALLOWED') && !isBad

    return (
      <div className={`p-4 rounded-xl border text-sm transition-all ${
        isResult && isBad
          ? 'bg-red-900/40 border-red-600'
          : isResult
          ? 'bg-green-900/40 border-green-600'
          : 'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center gap-3 mb-1">
          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
            step.request === 'A' ? 'bg-blue-600' :
            step.request === 'B' ? 'bg-purple-600' :
            step.request === '⚠️' ? 'bg-red-600' :
            'bg-green-600'
          }`}>
            {step.request}
          </span>
          <span className="text-gray-300 font-mono">{step.action}</span>
          <span className={`ml-auto font-bold ${
            isBad ? 'text-red-400' : isResult ? 'text-green-400' : 'text-yellow-400'
          }`}>
            {step.value}
          </span>
        </div>
        <p className="text-gray-500 text-xs">{step.note}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Explanation */}
      <div className="bg-gray-900 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-3">The Race Condition Problem</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          When two requests arrive at the same time, they both read the counter before either one writes back.
          Both see a count below the limit, both get through — even if one should have been blocked.
          This is a <span className="text-red-400 font-semibold">race condition</span>.
          Lua scripts fix this by making the read and write <span className="text-green-400 font-semibold">atomic</span> —
          one uninterruptible operation inside Redis.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-8">

        {/* Naive - broken */}
        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">❌ Naive (Broken)</h3>
              <p className="text-gray-500 text-xs mt-1">GET then INCR — two separate Redis calls</p>
            </div>
            <button
              onClick={runNaive}
              disabled={naiveRunning}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition-colors"
            >
              {naiveRunning ? 'Running...' : 'Run Demo'}
            </button>
          </div>

          {/* Code snippet */}
          <div className="bg-gray-950 rounded-xl p-4 font-mono text-xs text-gray-400">
            <p><span className="text-blue-400">const</span> count = <span className="text-yellow-400">await</span> redis.<span className="text-green-400">get</span>(key)</p>
            <p className="text-gray-600">// ← gap here, race condition lives here</p>
            <p><span className="text-yellow-400">await</span> redis.<span className="text-green-400">incr</span>(key)</p>
          </div>

          <div className="flex flex-col gap-2 min-h-48">
            {naiveSteps.length === 0 && (
              <p className="text-gray-600 text-sm">Click "Run Demo" to see the race condition.</p>
            )}
            {naiveSteps.map((step, i) => (
              <StepCard key={i} step={step} />
            ))}
          </div>
        </div>

        {/* Lua - fixed */}
        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">✅ Lua Script (Fixed)</h3>
              <p className="text-gray-500 text-xs mt-1">Atomic read+write inside Redis</p>
            </div>
            <button
              onClick={runLua}
              disabled={luaRunning}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition-colors"
            >
              {luaRunning ? 'Running...' : 'Run Demo'}
            </button>
          </div>

          {/* Code snippet */}
          <div className="bg-gray-950 rounded-xl p-4 font-mono text-xs text-gray-400">
            <p><span className="text-blue-400">await</span> redis.<span className="text-green-400">eval</span>(luaScript, ...)</p>
            <p className="text-gray-600">// ← no gap, runs as one atomic operation</p>
            <p className="text-gray-600">// ← nothing can interrupt it</p>
          </div>

          <div className="flex flex-col gap-2 min-h-48">
            {luaSteps.length === 0 && (
              <p className="text-gray-600 text-sm">Click "Run Demo" to see the Lua fix.</p>
            )}
            {luaSteps.map((step, i) => (
              <StepCard key={i} step={step} />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}