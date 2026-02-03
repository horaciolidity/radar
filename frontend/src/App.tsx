import { useState } from 'react'
import { Activity, ShieldAlert, Zap, Layers } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState('radar')

  return (
    <div className="min-h-screen bg-brand-dark text-white font-sans">
      {/* Navbar */}
      <nav className="border-b border-brand-gray bg-brand-dark/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Activity className="text-brand-accent w-6 h-6" />
              <span className="font-bold text-xl tracking-tight">Contract Radar</span>
            </div>
            <div className="flex gap-4">
              <button className="px-3 py-1 text-sm bg-brand-gray rounded-md hover:bg-white/10 transition">Connect Wallet</button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Live Contracts" value="12,405" icon={<Layers className="text-blue-400" />} />
          <StatCard label="Scams Detected" value="843" icon={<ShieldAlert className="text-brand-danger" />} />
          <StatCard label="Opportunities" value="24" icon={<Zap className="text-brand-warning" />} />
          <StatCard label="24h Volume" value="$4.2M" icon={<Activity className="text-brand-safe" />} />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center">
          <div className="flex gap-2">
            <TabButton active={activeTab === 'radar'} onClick={() => setActiveTab('radar')}>Live Radar</TabButton>
            <TabButton active={activeTab === 'risks'} onClick={() => setActiveTab('risks')}>Risk Analysis</TabButton>
          </div>
          <div className="flex gap-2">
            <select className="bg-brand-gray border border-white/10 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-brand-accent">
              <option>All Chains</option>
              <option>Ethereum</option>
              <option>BSC</option>
              <option>Arbitrum</option>
            </select>
          </div>
        </div>

        {/* Radar Table Placeholder */}
        <div className="bg-brand-gray border border-white/5 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-6 text-center text-white/40 py-20">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-20 animate-pulse" />
            <h3 className="text-lg font-medium text-white/80">Waiting for backend connection...</h3>
            <p className="text-sm">The radar is scanning for new contracts on the blockchain.</p>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string, value: string, icon: any }) {
  return (
    <div className="bg-brand-gray border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-white/10 transition">
      <div>
        <p className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <div className="bg-white/5 p-2 rounded-lg">{icon}</div>
    </div>
  )
}

function TabButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${active
          ? 'bg-brand-accent text-brand-dark shadow-[0_0_15px_rgba(0,255,148,0.3)]'
          : 'text-white/60 hover:text-white hover:bg-white/5'
        }`}
    >
      {children}
    </button>
  )
}

export default App
