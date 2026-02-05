import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { walletManager } from '../lib/walletManager';
import WalletCard from './WalletCard';
import {
    Activity, Shield, Search, RefreshCw,
    Filter, LayoutGrid, List as ListIcon,
    AlertCircle, Info, DollarSign, Wallet as WalletIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export default function WalletRadar() {
    const [wallets, setWallets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeNetwork, setActiveNetwork] = useState('all');
    const [filterType, setFilterType] = useState('all'); // 'all' or 'multisig'
    const [viewMode, setViewMode] = useState('grid');
    const [isScanning, setIsScanning] = useState(false);
    const [foundCount, setFoundCount] = useState(0);
    const intervalsRef = useRef({});

    const fetchWallets = async () => {
        try {
            setIsLoading(true);
            let query = supabase
                .from('wallets')
                .select('*')
                .order('balance_usd', { ascending: false })
                .limit(50);

            if (activeNetwork !== 'all') {
                query = query.eq('network', activeNetwork);
            }

            if (filterType === 'multisig') {
                query = query.eq('is_multisig', true);
            }

            const { data, error } = await query;
            if (error) throw error;
            setWallets(data || []);
        } catch (err) {
            console.error("Error fetching wallets:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchWallets();

        const channel = supabase
            .channel('public:wallets')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wallets' }, (payload) => {
                if (filterType === 'multisig' && !payload.new.is_multisig) return;
                setWallets(prev => [payload.new, ...prev].sort((a, b) => b.balance_usd - a.balance_usd).slice(0, 50));
                setFoundCount(c => c + 1);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeNetwork, filterType]);

    const toggleGlobalScan = () => {
        const newState = !isScanning;
        setIsScanning(newState);

        const networks = ['Ethereum', 'BSC', 'Polygon', 'Base', 'Arbitrum', 'Optimism'];

        if (newState) {
            networks.forEach(network => {
                // Initial scan
                walletManager.scanRecentBlocks(network, 5);
                // Interval scan
                intervalsRef.current[network] = setInterval(() => {
                    walletManager.scanRecentBlocks(network, 1);
                }, 15000);
            });
        } else {
            Object.values(intervalsRef.current).forEach(clearInterval);
            intervalsRef.current = {};
        }
    };

    useEffect(() => {
        return () => {
            Object.values(intervalsRef.current).forEach(clearInterval);
        };
    }, []);

    const filteredWallets = wallets.filter(w => {
        if (activeNetwork !== 'all' && w.network !== activeNetwork) return false;
        if (filterType === 'multisig' && !w.is_multisig) return false;
        return true;
    });

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Control Panel */}
            <div className="glass-card rounded-[2rem] border-white/5 p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] -mr-32 -mt-32 pointer-events-none" />

                <div className="flex items-center gap-6 relative z-10">
                    <div className={cn(
                        "w-20 h-20 rounded-3xl flex items-center justify-center text-3xl transition-all duration-500 shadow-2xl",
                        isScanning ? "bg-primary text-white shadow-primary/30 animate-pulse" : "bg-zinc-800 text-zinc-500 border border-white/5"
                    )}>
                        <Activity size={40} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white italic tracking-tight uppercase">
                            Wallet <span className="text-primary italic">Finder</span>
                        </h2>
                        <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
                            <span className={cn("inline-block w-2 h-2 rounded-full", isScanning ? "bg-success animate-ping" : "bg-zinc-700")} />
                            {isScanning ? `${foundCount} NEW WALLETS DETECTED THIS SESSION` : 'RADAR STANDBY • SELECT NETWORKS TO START'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 relative z-10">
                    <button
                        onClick={toggleGlobalScan}
                        className={cn(
                            "px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center gap-3 shadow-xl",
                            isScanning
                                ? "bg-danger text-white hover:bg-danger/80 shadow-danger/20"
                                : "bg-primary text-black hover:scale-105 shadow-primary/20"
                        )}
                    >
                        {isScanning ? <Shield size={18} /> : <Activity size={18} />}
                        {isScanning ? 'HALT DETECTION' : 'INITIALIZE RADAR'}
                    </button>
                    <button
                        onClick={fetchWallets}
                        className="p-4 bg-zinc-800 text-white rounded-2xl hover:bg-zinc-700 transition-all border border-white/5"
                    >
                        <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Sub-Filters */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                    {['all', 'Ethereum', 'BSC', 'Polygon', 'Base', 'Arbitrum', 'Optimism'].map(net => (
                        <button
                            key={net}
                            onClick={() => setActiveNetwork(net)}
                            className={cn(
                                "px-5 py-2.5 rounded-xl text-xs font-black transition-all border uppercase italic tracking-widest",
                                activeNetwork === net
                                    ? "bg-white text-black border-white shadow-lg"
                                    : "bg-zinc-900/50 text-zinc-500 border-white/5 hover:border-white/20"
                            )}
                        >
                            {net}
                        </button>
                    ))}
                    <div className="w-px h-10 bg-white/5 mx-2 hidden md:block" />
                    <button
                        onClick={() => setFilterType(filterType === 'all' ? 'multisig' : 'all')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-xs font-black transition-all border uppercase italic tracking-widest flex items-center gap-2",
                            filterType === 'multisig'
                                ? "bg-primary text-black border-primary shadow-lg"
                                : "bg-zinc-900/50 text-zinc-500 border-white/5 hover:border-white/20"
                        )}
                    >
                        <Shield size={14} />
                        Multi-sig Only
                    </button>
                </div>

                <div className="flex bg-zinc-900/50 border border-white/5 rounded-xl p-1">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn("p-2.5 rounded-lg transition-all", viewMode === 'grid' ? "bg-white/10 text-white" : "text-zinc-600")}
                    >
                        <LayoutGrid size={20} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn("p-2.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white/10 text-white" : "text-zinc-600")}
                    >
                        <ListIcon size={20} />
                    </button>
                </div>
            </div>

            {/* Content Feed */}
            {isLoading && wallets.length === 0 ? (
                <div className="py-32 flex flex-col items-center justify-center gap-6">
                    <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.2em]">Synchronizing with global data nodes...</p>
                </div>
            ) : filteredWallets.length > 0 ? (
                <div className={cn(
                    "grid gap-6 transition-all duration-500",
                    viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col max-w-4xl mx-auto"
                )}>
                    <AnimatePresence mode='popLayout'>
                        {filteredWallets.map((wallet) => (
                            <motion.div
                                key={wallet.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                            >
                                <WalletCard wallet={wallet} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="py-40 flex flex-col items-center justify-center glass-card rounded-[3rem] border-dashed border-2 border-white/5">
                    <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-700 mb-6 border border-white/5">
                        <WalletIcon size={48} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">No High-Value Wallets Located</h3>
                    <p className="text-zinc-500 text-sm max-w-sm text-center">
                        Silence on the network. Initialize the radar or adjust your filters to detect active whales.
                    </p>
                    <button
                        onClick={toggleGlobalScan}
                        className="mt-8 px-8 py-3 bg-primary text-black font-black rounded-xl hover:scale-105 transition-all text-sm italic"
                    >
                        ENGAGE DETECTION
                    </button>
                </div>
            )}
        </div>
    );
}
