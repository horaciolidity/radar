import React, { useEffect, useState } from 'react';
import { Activity, RefreshCcw, History, Globe, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';
import { contractManager } from '../lib/contractManager';

export default function NetworkRadarManager({ scanStatus, onToggle, onHistory }) {
    const [stats, setStats] = useState({});

    // Update stats every second to show last blocks
    useEffect(() => {
        const timer = setInterval(() => {
            const newStats = {};
            scanStatus.availableNetworks.forEach(net => {
                newStats[net] = contractManager.getStatus(net);
            });
            setStats(newStats);
        }, 1000);
        return () => clearInterval(timer);
    }, [scanStatus.availableNetworks]);

    return (
        <div className="glass-card rounded-2xl p-6 mb-8 border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Cpu size={120} />
            </div>

            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2 bg-primary/20 rounded-lg text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
                    <Globe size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">Scanner Control Center</h3>
                    <div className="flex items-center gap-2">
                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Global Indexing Status</p>
                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                        <span className="text-[10px] text-primary font-mono font-bold">TOTAL SCANNING REPUTATION ACTIVE</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                {scanStatus.availableNetworks.map(net => {
                    const isScanning = scanStatus.activeScans[net];
                    const netStats = stats[net] || {};
                    return (
                        <div key={net} className={cn(
                            "bg-zinc-900/40 rounded-xl p-4 border transition-all duration-300 group",
                            isScanning ? "border-primary/20 bg-primary/5" : "border-white/5 hover:border-white/10"
                        )}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        isScanning ? "bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-zinc-700"
                                    )} />
                                    <span className="font-bold text-sm text-zinc-200">{net}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className={cn(
                                        "text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-tighter",
                                        isScanning ? "bg-success/10 text-success" : "bg-zinc-800 text-zinc-500"
                                    )}>
                                        {isScanning ? "ACTIVE" : "IDLE"}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-4 space-y-1">
                                <div className="flex justify-between text-[10px] font-mono">
                                    <span className="text-zinc-600 uppercase">Last Height:</span>
                                    <span className="text-zinc-400">{netStats.lastBlock || '---'}</span>
                                </div>
                                <div className="w-full bg-zinc-800/50 h-1 rounded-full overflow-hidden">
                                    {isScanning && <div className="h-full bg-primary animate-[shimmer_2s_infinite]" style={{ width: '40%' }} />}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => onToggle(net)}
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all border uppercase",
                                        isScanning
                                            ? "bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                                            : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                                    )}
                                >
                                    {isScanning ? <RefreshCcw size={12} className="animate-spin" /> : <Activity size={12} />}
                                    {isScanning ? "Stop" : "Scan"}
                                </button>

                                <button
                                    onClick={() => onHistory(net)}
                                    className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-all uppercase"
                                >
                                    <History size={12} />
                                    Deep
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
