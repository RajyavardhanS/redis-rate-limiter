import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import TokenBucket from './components/TokenBucket'
import RaceCondition from './components/RaceCondition'
import AlgorithmComparison from './components/AlgorithmComparison'
import LiveFeed from './components/LiveFeed'

const socket = io()

const tabs = [
  { id: 'tokenBucket', label: '🪣 Token Bucket' },
  { id: 'raceCondition', label: '⚡ Race Condition' },
  { id: 'comparison', label: '📊 Comparison' },
  { id: 'liveFeed', label: '📡 Live Feed' },
]

export default function App() {
  const [connected, setConnected] = useState(false)
  const [activeTab, setActiveTab] = useState('tokenBucket')

  useEffect(() => {
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    return () => {
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-8 py-4 flex items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-white">Rate Limiter Visualizer</h1>
          <p className="text-gray-500 text-xs">Redis-backed • Atomic Lua Scripts • 3 Algorithms</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-gray-900 border-b border-gray-800 px-8 flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="p-8 max-w-6xl mx-auto">
        {activeTab === 'tokenBucket' && <TokenBucket socket={socket} />}
        {activeTab === 'raceCondition' && <RaceCondition socket={socket} />}
        {activeTab === 'comparison' && <AlgorithmComparison socket={socket} />}
        {activeTab === 'liveFeed' && <LiveFeed socket={socket} />}
      </main>

    </div>
  )
}