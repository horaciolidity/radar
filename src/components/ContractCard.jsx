import React, { useState } from 'react';
import {
    ShieldCheck, ShieldAlert, Zap, Lock, ExternalLink,
    Copy, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
    Code2, Wallet, Database, AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { NETWORKS } from '../data/mockData';

// Helper for relative time since we don't have utils handy
const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
};

export default function ContractCard({ contract }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const network = NETWORKS.find(n => n.id.toLowerCase() === contract.network.toLowerCase()) || NETWORKS[0];

    const getExplorerUrl = () => {
        const explorers = {
            'Ethereum': 'https://etherscan.io',
            'BSC': 'https://bscscan.com',
            'Polygon': 'https://polygonscan.com',
            'Base': 'https://basescan.org',
            'Arbitrum': 'https://arbiscan.io',
            'Optimism': 'https://optimistic.etherscan.io'
        };
        return `${explorers[contract.network] || 'https://etherscan.io'}/address/${contract.address}`;
    };

    const copyAddress = () => {
        navigator.clipboard.writeText(contract.address);
    };

    const getStatusColor = () => {
        switch (contract.tag) {
            case 'CRITICAL': return 'text-danger border-danger/30 bg-danger/10';
            case 'HIGH': return 'text-warning border-warning/30 bg-warning/10';
            case 'MEDIUM': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
            default: return 'text-success border-success/30 bg-success/10';
        }
    };

    return (
        <div className={cn(
            "glass-card transition-all duration-300 rounded-2xl p-5 border flex flex-col gap-4 relative",
            contract.tag === 'CRITICAL' ? 'border-danger/20 bg-danger/[0.02]' : 'border-white/5'
        )}>
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg border border-white/5"
                        style={{ backgroundColor: `${network?.color || '#333'}20` }}
                    >
                        {network?.icon || '🌐'}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base text-white">{contract.name || 'Unknown Token'}</h3>
                            <span className="text-[10px] text-zinc-500 font-mono tracking-tighter">({contract.symbol || '???'})</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-zinc-500 font-mono">{contract.address.slice(0, 6)}...{contract.address.slice(-4)}</span>
                            <button onClick={copyAddress} className="p-1 hover:bg-white/5 rounded text-zinc-600 hover:text-white transition-colors">
                                <Copy size={10} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                        <RefreshCw size={10} className="animate-spin-slow" />
                        {formatTime(contract.timestamp)}
                    </span>
                    <div className={cn("badge text-[10px] font-bold uppercase py-0.5 px-2 rounded border", getStatusColor())}>
                        {contract.tag} Risk ({contract.riskScore}/100)
                    </div>
                </div>
            </div>

            {/* Quick Specs */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-900/50 rounded-lg p-2 border border-white/[0.02]">
                    <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                        <Database size={12} />
                        <p className="text-[10px] uppercase font-bold">Type</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-300">{contract.type}</span>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-2 border border-white/[0.02]">
                    <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                        <Wallet size={12} />
                        <p className="text-[10px] uppercase font-bold">Deployer</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-300">
                        {contract.deployer ? `${contract.deployer.slice(0, 6)}...` : '0x...'}
                    </span>
                </div>
            </div>

            {/* Evidence & Findings */}
            {contract.findings && contract.findings.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            <AlertTriangle size={12} className={contract.tag === 'CRITICAL' ? 'text-danger' : 'text-warning'} />
                            Security Evidence
                        </p>
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-primary text-[10px] font-bold hover:underline"
                        >
                            {isExpanded ? 'SIMPLIFY' : 'VIEW DETAILS'}
                        </button>
                    </div>

                    <div className="space-y-2">
                        {contract.findings.slice(0, isExpanded ? 10 : 1).map((f, i) => (
                            <div key={i} className="bg-zinc-900/80 rounded-lg p-3 border border-white/5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className={cn(
                                        "text-[10px] font-black uppercase",
                                        f.severity === 'CRITICAL' ? 'text-danger' :
                                            f.severity === 'HIGH' ? 'text-warning' : 'text-zinc-400'
                                    )}>{f.type}</span>
                                    <span className="text-[10px] text-zinc-600 font-mono">#{i + 1}</span>
                                </div>
                                <p className="text-xs text-zinc-300 mb-2">{f.description}</p>
                                {isExpanded && f.evidence && (
                                    <div className="bg-black/50 rounded-md p-2 mt-2 border border-white/5">
                                        <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 mb-1">
                                            <Code2 size={10} />
                                            TECHNICAL EVIDENCE
                                        </div>
                                        <code className="text-[9px] text-primary/80 font-mono break-all leading-relaxed">
                                            {f.evidence}
                                        </code>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer Features */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                <div className="flex gap-1.5 overflow-hidden">
                    {contract.features && contract.features.slice(0, 3).map(f => (
                        <span key={f} className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded uppercase font-bold">
                            {f}
                        </span>
                    ))}
                </div>
                <a
                    href={getExplorerUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 hover:bg-primary/20 text-zinc-500 hover:text-primary rounded-lg transition-all"
                >
                    <ExternalLink size={14} />
                </a>
            </div>

            {/* Scam Glow */}
            {contract.tag === 'CRITICAL' && (
                <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-danger/50 to-transparent" />
            )}
        </div>
    );
}
