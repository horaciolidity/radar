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

    return (
        <div className="mb-8 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 glass-card rounded-lg text-xs font-medium text-zinc-400">
                    <Filter size={14} />
                    Networks:
                </div>
                <div className="flex flex-wrap gap-2">
                    {NETWORKS.map(net => (
                        <button
                            key={net.id}
                            onClick={() => toggleFilter('network', net.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 border border-white/5",
                                activeFilters.network === net.id
                                    ? "bg-white text-black border-white"
                                    : "bg-surface/50 text-zinc-400 hover:bg-surface-lighter hover:text-white"
                            )}
                        >
                            <span>{net.icon}</span>
                            {net.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
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
                </div>

                <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

                <div className="flex flex-wrap gap-3">
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
    );
}
