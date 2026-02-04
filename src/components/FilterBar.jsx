import React from 'react';
import { Filter, Layers, ShieldCheck, Zap, AlertTriangle, Ghost } from 'lucide-react';
import { NETWORKS } from '../data/mockData';
import { cn } from '../lib/utils';

export default function FilterBar({ activeFilters, toggleFilter }) {
    const safetyFilters = [
        { id: 'hasLiquidity', label: 'Liquidity', icon: <Zap size={14} />, color: 'text-success' },
        { id: 'isSafe', label: 'Verified Safe', icon: <ShieldCheck size={14} />, color: 'text-primary' },
        { id: 'noVulnerability', label: 'No Vulnerabilities', icon: <Layers size={14} />, color: 'text-accent' },
        { id: 'isNotScam', label: 'Clean Record', icon: <ShieldCheck size={14} />, color: 'text-emerald-400' },
    ];

    const riskFilters = [
        { id: 'isVulnerable', label: 'Vulnerable', icon: <AlertTriangle size={14} />, color: 'text-warning' },
        { id: 'isScam', label: 'Likely Scam', icon: <Ghost size={14} />, color: 'text-danger' },
    ];

    const ageFilters = [
        { id: 'recent', label: 'Recent (24h)', icon: <Zap size={14} /> },
        { id: 'old', label: '> 1 Year', icon: <History size={14} /> },
    ];

    return (
        <div className="mb-8 space-y-6">
            {/* Network Filter */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 glass-card rounded-lg text-xs font-medium text-zinc-400">
                    <Globe size={14} />
                    Networks:
                </div>
                <div className="flex flex-wrap gap-2">
                    {NETWORKS.map(net => (
                        <button
                            key={net.id}
                            onClick={() => toggleFilter('network', net.id)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
                                activeFilters.network === net.id
                                    ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                                    : "bg-surface/50 text-zinc-400 border-white/5 hover:border-white/10"
                            )}
                        >
                            <span>{net.icon}</span>
                            {net.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-8">
                {/* Age Filter */}
                <div className="space-y-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Contract Age</p>
                    <div className="flex gap-2">
                        {ageFilters.map(filter => (
                            <button
                                key={filter.id}
                                onClick={() => toggleFilter('age', filter.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border",
                                    activeFilters.age === filter.id
                                        ? "bg-primary/20 border-primary/50 text-primary"
                                        : "bg-surface/30 border-white/5 text-zinc-500 hover:text-white"
                                )}
                            >
                                {filter.icon}
                                {filter.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-10 w-px bg-zinc-800 hidden lg:block" />

                {/* Safety & Risk */}
                <div className="space-y-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Security Status</p>
                    <div className="flex flex-wrap gap-3">
                        {safetyFilters.map(filter => (
                            <button
                                key={filter.id}
                                onClick={() => toggleFilter('safety', filter.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border",
                                    activeFilters.safety.includes(filter.id)
                                        ? "bg-surface-lighter border-white/20 text-white"
                                        : "bg-surface/30 border-white/5 text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                <div className={cn(activeFilters.safety.includes(filter.id) ? filter.color : "text-zinc-600")}>
                                    {filter.icon}
                                </div>
                                {filter.label}
                            </button>
                        ))}
                        {riskFilters.map(filter => (
                            <button
                                key={filter.id}
                                onClick={() => toggleFilter('risk', filter.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border",
                                    activeFilters.risk.includes(filter.id)
                                        ? "bg-danger/10 border-danger/50 text-danger"
                                        : "bg-surface/30 border-white/5 text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {filter.icon}
                                {filter.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
