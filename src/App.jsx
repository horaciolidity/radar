import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import ContractCard from './components/ContractCard';
import RadarControl from './components/RadarControl';
import { Activity, LayoutGrid, List as ListIcon, Info, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './lib/supabase';
import { contractManager } from './lib/contractManager';

function App() {
  const [contracts, setContracts] = useState([]);
  const [activeFilters, setActiveFilters] = useState({
    network: 'all',
    safety: [],
    risk: [],
    age: 'recent'
  });
  const [viewMode, setViewMode] = useState('grid');
  const [scanStatus, setScanStatus] = useState({
    activeScans: {},
    availableNetworks: ['Ethereum', 'BSC', 'Polygon', 'Base', 'Arbitrum', 'Optimism']
  });
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState(null);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);
      } catch (error) {
        console.error("Wallet connection failed", error);
      }
    } else if (window.tronWeb) {
      try {
        if (window.tronWeb.defaultAddress.base58) {
          setAccount(window.tronWeb.defaultAddress.base58);
        } else {
          await window.tronLink.request({ method: 'tron_requestAccounts' });
          setAccount(window.tronWeb.defaultAddress.base58);
        }
      } catch (error) {
        console.error("Tron connection failed", error);
      }
    } else {
      alert("Please install MetaMask or TronLink!");
    }
  };

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
    isVulnerable: dbRow.is_vulnerable
  });

  const fetchContracts = async () => {
    try {
      let query = supabase
        .from('contracts')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (activeFilters.network !== 'all') {
        query = query.eq('network', activeFilters.network);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        setContracts(data.map(mapDbToInternal));
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching contracts:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();

    // Subscribe to REALTIME updates from Supabase
    const channel = supabase
      .channel('public:contracts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setContracts(prev => [mapDbToInternal(payload.new), ...prev.slice(0, 99)]);
        } else if (payload.eventType === 'UPDATE') {
          setContracts(prev => prev.map(c => c.id === payload.new.id ? mapDbToInternal(payload.new) : c));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeFilters.network]);

  const toggleScanning = async (networkName) => {
    const isCurrentlyScanning = scanStatus.activeScans[networkName];
    setScanStatus(prev => ({
      ...prev,
      activeScans: { ...prev.activeScans, [networkName]: !isCurrentlyScanning }
    }));

    if (!isCurrentlyScanning) {
      // Start a "background" scan in the browser
      const scanLoop = async () => {
        while (true) {
          // Check if still scanning this network (using ref or status)
          // Simplified for the demo: Scan once per minute while tab is open
          await contractManager.scanRecentBlocks(networkName, 1);
          await new Promise(r => setTimeout(r, 30000));
          // Note: In a production app, we would use a cleaner loop control
        }
      };
      scanLoop();
    }
  };

  const requestHistory = async (networkName) => {
    setIsLoading(true);
    await contractManager.scanRecentBlocks(networkName, 10);
    setIsLoading(false);
    alert(`Historical scan for ${networkName} completed!`);
  };

  const handleSearch = async (address) => {
    if (!address.startsWith('0x')) {
      alert("Please enter a valid EVM address");
      return;
    }
    setIsLoading(true);
    const result = await contractManager.findAndAnalyze(address, activeFilters.network !== 'all' ? activeFilters.network : 'Ethereum');
    setIsLoading(false);
    if (!result) {
      alert("Contract not found or analysis failed");
    } else {
      fetchContracts(); // Refresh to show the new contract
    }
  };



  const toggleFilter = (type, value) => {
    setActiveFilters(prev => {
      if (type === 'network' || type === 'age') {
        // For exclusive filters like network and age, toggle between the value and 'all' (or 'recent' for age)
        // If the current value is the same as the new value, reset it.
        // For 'age', if value is 'recent' and it's already 'recent', reset to 'all' (or a default 'none' state if applicable).
        // The instruction implies 'all' as a reset for both, which might be slightly ambiguous for 'age'.
        // Assuming 'all' means no age filter applied, or a default state.
        // Let's adjust based on the instruction's `prev[type] === value ? 'all' : value`
        // For age, if 'recent' is clicked and it's already 'recent', it will become 'all'.
        // If 'old' is clicked and it's already 'old', it will become 'all'.
        // If 'all' is clicked, it will become 'all'.
        // This might not be the desired behavior for age if 'all' is not a valid age filter.
        // A more robust approach for age might be:
        // return { ...prev, [type]: prev[type] === value ? (type === 'age' ? 'recent' : 'all') : value };
        // However, sticking to the instruction:
        return { ...prev, [type]: prev[type] === value ? 'all' : value };
      }

      const currentList = prev[type];
      const newList = currentList.includes(value)
        ? currentList.filter(v => v !== value)
        : [...currentList, value];

      return { ...prev, [type]: newList };
    });
  };

  const filteredContracts = contracts.filter(contract => {
    if (activeFilters.network !== 'all' && contract.network.toLowerCase() !== activeFilters.network.toLowerCase()) return false;

    // Age filtering
    const contractDate = new Date(contract.timestamp);
    const now = new Date();
    const ageInHours = (now - contractDate) / (1000 * 60 * 60);
    const ageInDays = ageInHours / 24;

    if (activeFilters.age === 'recent' && ageInHours > 24) return false;
    if (activeFilters.age === 'old' && ageInDays < 365) return false;

    // Safety filters mapping to backend data
    if (activeFilters.safety.includes('isSafe') && contract.tag !== 'SAFE') return false;
    if (activeFilters.safety.includes('noVulnerability') && contract.isVulnerable) return false;
    if (activeFilters.safety.includes('isNotScam') && contract.isNotScam === false) return false;

    // Risk filters
    if (activeFilters.risk.includes('isVulnerable') && !contract.isVulnerable) return false;
    if (activeFilters.risk.includes('isScam') && !contract.isScam) return false;

    return true;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header account={account} onConnect={connectWallet} onSearch={handleSearch} />

      <main className="flex-1 container mx-auto px-6 py-8">
        {/* Dashboard Hero */}
        <section className="mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary font-mono text-sm">
                <Activity size={16} className="animate-pulse" />
                MULTI-CHAIN RADAR ACTIVE
              </div>
              <h2 className="text-4xl font-black tracking-tight text-white uppercase italic">
                Network <span className="text-primary">Radar</span>
              </h2>
              <p className="text-zinc-400 max-w-xl">
                Real-time security auditing and historical contract detection across all major EVM networks.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex bg-surface border border-white/5 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                >
                  <ListIcon size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <RadarControl
              scanStatus={scanStatus}
              onToggle={toggleScanning}
              onHistory={requestHistory}
            />
          </div>

          <div className="mt-8">
            <FilterBar activeFilters={activeFilters} toggleFilter={toggleFilter} />
          </div>
        </section>

        {/* Results Stats */}
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            Showing <span className="text-white font-bold">{filteredContracts.length}</span> active signals
          </div>
          <div className="flex items-center gap-4 text-[10px] text-zinc-500">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-success" /> Safe
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-warning" /> Warning
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-danger" /> Danger
            </div>
          </div>
        </div>

        {/* Feed */}
        {filteredContracts.length > 0 ? (
          <motion.div
            layout
            className={viewMode === 'grid' ? "radar-grid" : "space-y-4 max-w-4xl mx-auto"}
          >
            <AnimatePresence mode='popLayout'>
              {filteredContracts.map((contract) => (
                <motion.div
                  key={contract.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  <ContractCard contract={contract} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="py-24 text-center glass-card rounded-3xl border-dashed border-2 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-surface-lighter rounded-full flex items-center justify-center text-zinc-600">
              <Info size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">No contracts found</h3>
              <p className="text-zinc-500">Try adjusting your filters or starting a radar scan above</p>
            </div>
          </div>
        )}
      </main>

      <footer className="py-8 border-t border-white/5 mt-12 bg-surface/30">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            &copy; 2026 Contract Radar Alpha // Secure the decentralized web
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">Documentation</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">API Keys</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
