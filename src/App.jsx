import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import ContractCard from './components/ContractCard';
import RadarControl from './components/RadarControl';
import { Activity, LayoutGrid, List as ListIcon, Info, RefreshCcw, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './lib/supabase';
import { contractManager } from './lib/contractManager';
import { cn } from './lib/utils';
import WalletRadar from './components/WalletRadar';
import AuditPage from './components/AuditPage';

function App() {
  const [contracts, setContracts] = useState([]);
  const [activeFilters, setActiveFilters] = useState({
    network: 'all',
    safety: [],
    risk: [],
    age: 'all'
  });
  const [viewMode, setViewMode] = useState('grid');
  const [scanStatus, setScanStatus] = useState({
    activeScans: {},
    availableNetworks: ['Ethereum', 'BSC', 'Polygon', 'Base', 'Arbitrum', 'Optimism']
  });
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [foundThisSession, setFoundThisSession] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [activeTab, setActiveTab] = useState('contracts'); // 'contracts' | 'wallets' | 'auditor'

  const mapDbToInternal = (dbRow) => ({
    id: dbRow.id,
    network: dbRow.network,
    address: dbRow.address,
    deployer: dbRow.deployer,
    blockNumber: dbRow.block_number,
    txHash: dbRow.tx_hash,
    timestamp: dbRow.timestamp,
    tag: dbRow.tag,
    riskScore: dbRow.risk_score,
    type: dbRow.type,
    name: dbRow.name,
    symbol: dbRow.symbol,
    findings: dbRow.findings,
    features: dbRow.features,
    isScam: dbRow.is_scam,
    isVulnerable: dbRow.is_vulnerable,
    hasLiquidity: dbRow.has_liquidity || false,
    isMintable: dbRow.is_mintable || false,
    isBurnable: dbRow.is_burnable || false
  });

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);
      } catch (error) {
        console.error("Wallet connection failed", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const fetchContracts = async (append = false) => {
    try {
      if (!append) setIsLoading(true);
      const LIMIT = 100;
      const offset = append ? contracts.length : 0;

      let query = supabase
        .from('contracts')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(offset, offset + LIMIT - 1);

      if (activeFilters.network !== 'all') {
        query = query.eq('network', activeFilters.network);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const newContracts = data.map(mapDbToInternal);
        if (append) {
          setContracts(prev => [...prev, ...newContracts]);
        } else {
          setContracts(newContracts);
        }
        setHasMore(data.length === LIMIT);
      }
      setIsLoading(false);
      setIsFetchingMore(false);
    } catch (err) {
      console.error("Error fetching contracts:", err);
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  useEffect(() => {
    fetchContracts();

    const channel = supabase
      .channel('public:contracts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setContracts(prev => {
            const newList = [mapDbToInternal(payload.new), ...prev];
            return prev.length <= 100 ? newList.slice(0, 100) : newList;
          });
          setFoundThisSession(prev => prev + 1);
        } else if (payload.eventType === 'UPDATE') {
          setContracts(prev => prev.map(c => c.id === payload.new.id ? mapDbToInternal(payload.new) : c));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeFilters.network]);

  const intervalsRef = useRef({});

  useEffect(() => {
    const activeNetworks = Object.keys(scanStatus.activeScans).filter(nw => scanStatus.activeScans[nw]);

    Object.keys(intervalsRef.current).forEach(network => {
      if (!scanStatus.activeScans[network]) {
        clearInterval(intervalsRef.current[network]);
        delete intervalsRef.current[network];
      }
    });

    activeNetworks.forEach(network => {
      if (!intervalsRef.current[network]) {
        contractManager.scanRecentBlocks(network, 1);
        intervalsRef.current[network] = setInterval(() => {
          contractManager.scanRecentBlocks(network);
        }, 15000);
      }
    });
  }, [scanStatus.activeScans]);

  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach(clearInterval);
      intervalsRef.current = {};
    };
  }, []);

  const toggleScanning = (networkName) => {
    setScanStatus(prev => ({
      ...prev,
      activeScans: { ...prev.activeScans, [networkName]: !prev.activeScans[networkName] }
    }));
  };

  const requestHistory = async (networkName) => {
    await contractManager.scanRecentBlocks(networkName, 10);
    alert(`Historical scan for ${networkName} completed!`);
  };

  const handleSearch = async (address) => {
    if (!address.startsWith('0x')) return;
    const result = await contractManager.findAndAnalyze(address, activeFilters.network !== 'all' ? activeFilters.network : 'Ethereum');
    if (result) fetchContracts();
  };

  const toggleFilter = (type, value) => {
    setActiveFilters(prev => {
      if (type === 'network' || type === 'age') return { ...prev, [type]: prev[type] === value ? 'all' : value };
      const currentList = prev[type];
      const newList = currentList.includes(value) ? currentList.filter(v => v !== value) : [...currentList, value];
      return { ...prev, [type]: newList };
    });
  };

  const filteredContracts = contracts.filter(contract => {
    if (activeFilters.network !== 'all' && contract.network.toLowerCase() !== activeFilters.network.toLowerCase()) return false;
    if (activeFilters.safety.includes('hasLiquidity') && !contract.hasLiquidity) return false;
    if (activeFilters.safety.includes('isSafe') && contract.tag !== 'SAFE') return false;
    if (activeFilters.risk.includes('isVulnerable') && !contract.isVulnerable) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header account={account} onConnect={connectWallet} onSearch={handleSearch} />

      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="flex justify-center mb-12">
          <div className="bg-surface/50 p-1.5 rounded-2xl border border-white/5 flex gap-2">
            <button onClick={() => setActiveTab('contracts')} className={cn("px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all italic", activeTab === 'contracts' ? "bg-primary text-black shadow-lg shadow-primary/20" : "text-zinc-500 hover:text-zinc-300")}>
              Surgical Radar
            </button>
            <button onClick={() => setActiveTab('wallets')} className={cn("px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all italic", activeTab === 'wallets' ? "bg-primary text-black shadow-lg shadow-primary/20" : "text-zinc-500 hover:text-zinc-300")}>
              Wallet Finder
            </button>
            <button onClick={() => setActiveTab('auditor')} className={cn("px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all italic", activeTab === 'auditor' ? "bg-primary text-black shadow-lg shadow-primary/20" : "text-zinc-500 hover:text-zinc-300")}>
              Auditor Visual
            </button>
          </div>
        </div>

        {activeTab === 'contracts' ? (
          <div className="animate-in fade-in duration-500">
            <section className="mb-12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-primary font-mono text-sm uppercase">
                    <ShieldAlert size={16} className="animate-pulse" />
                    Surgical Detection Protocol Active {foundThisSession > 0 && `• [${foundThisSession} NEW HITS]`}
                  </div>
                  <h2 className="text-4xl font-black tracking-tight text-white uppercase italic">
                    Surgical <span className="text-primary">Radar</span>
                  </h2>
                  <p className="text-zinc-400 max-w-xl">
                    Elite vulnerability detection for contracts with active capital (Eth/Tokens).
                    The radar ignores junk noise to focus strictly on high-yield exploitation signals.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex bg-surface border border-white/5 rounded-lg p-1">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}><LayoutGrid size={18} /></button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}><ListIcon size={18} /></button>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <RadarControl scanStatus={scanStatus} onToggle={toggleScanning} onHistory={requestHistory} />
              </div>

              <div className="mt-8">
                <FilterBar activeFilters={activeFilters} toggleFilter={toggleFilter} />
              </div>
            </section>

            <div className="flex items-center justify-between mb-6 px-2">
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                Showing <span className="text-white font-bold">{filteredContracts.length}</span> surgically identified targets
              </div>
              <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success" /> Safe</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-warning" /> Warning</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-danger" /> Danger</div>
              </div>
            </div>

            {filteredContracts.length > 0 ? (
              <motion.div layout className={viewMode === 'grid' ? "radar-grid" : "space-y-4 max-w-4xl mx-auto"}>
                <AnimatePresence mode='popLayout'>
                  {filteredContracts.map((contract) => (
                    <motion.div key={contract.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.4, ease: "easeOut" }}>
                      <ContractCard contract={contract} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="py-24 text-center glass-card rounded-3xl border-dashed border-2 flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-surface-lighter rounded-full flex items-center justify-center text-zinc-600"><Info size={32} /></div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-white">No surgical hits detected</h3>
                  <p className="text-zinc-500">Scanning networks for vulnerable contracts with balance...</p>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'wallets' ? (
          <WalletRadar />
        ) : (
          <AuditPage />
        )}
      </main>

      <footer className="py-8 border-t border-white/5 mt-12 bg-surface/30">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            &copy; 2026 Surgical Radar Alpha // Professional Security Intel
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
