import React from 'react';
import { Activity, RefreshCcw, History, Search, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export default function NetworkRadarManager({ scanStatus, onToggle, onHistory }) {
    return (
        <div className="glass-card rounded-2xl p-6 mb-8 border border-white/5">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Globe size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Radar Control Center</h3>
                    <p className="text-xs text-zinc-500">Manage real-time indexing and historical searches</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scanStatus.availableNetworks.map(net => {
                    const isScanning = scanStatus.activeScans[net];
                    return (
                        <div key={net} className="bg-zinc-900/50 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all group">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        isScanning ? "bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-zinc-700"
                                    )} />
                                    <span className="font-bold text-sm text-zinc-200">{net}</span>
                                </div>
                                <span className={cn(
                                    "text-[10px] font-mono px-2 py-0.5 rounded",
                                    isScanning ? "bg-success/10 text-success" : "bg-zinc-800 text-zinc-500"
                                )}>
                                    {isScanning ? "LIVE" : "IDLE"}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => onToggle(net)}
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all border",
                                        isScanning
                                            ? "bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                                            : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                                    )}
                                >
                                    <RefreshCcw size={14} className={isScanning ? "animate-spin" : ""} />
                                    {isScanning ? "STOP" : "START"}
                                </button>

                                <button
                                    onClick={() => onHistory(net)}
                                    className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-all"
                                >
                                    <History size={14} />
                                    HISTORY
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
