import React, { useState } from 'react';
import {
    ShieldCheck, ShieldAlert, Zap, Lock, ExternalLink,
    Copy, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
    Code2, Wallet, Database, AlertTriangle, Search, Flame
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
    const [viewMode, setViewMode] = useState('basic'); // 'basic' | 'advanced'
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
        const baseUrl = explorers[contract.network] || 'https://etherscan.io';
        return `${baseUrl}/address/${contract.address}`;
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
    };

    const getStatusColor = () => {
        switch (contract.tag) {
            case 'CRITICAL': return 'text-danger border-danger/30 bg-danger/10';
            case 'HIGH': return 'text-warning border-warning/30 bg-warning/10';
            case 'MEDIUM': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
            default: return 'text-success border-success/30 bg-success/10';
        }
    };

    const isVulnerable = contract.isVulnerable || contract.riskScore >= 40;

    return (
        <div className={cn(
            "glass-card transition-all duration-300 rounded-2xl p-5 border flex flex-col gap-4 relative overflow-hidden group/card",
            contract.tag === 'CRITICAL' ? 'border-danger/30 bg-danger/[0.03] shadow-[0_0_20px_rgba(239,68,68,0.1)]' :
                isVulnerable ? 'border-warning/30 bg-warning/[0.02]' : 'border-white/5'
        )}>
            {/* Background Network Accent */}
            <div
                className="absolute -right-4 -top-4 w-24 h-24 opacity-[0.03] pointer-events-none transition-transform group-hover/card:scale-110"
                style={{ color: network?.color || '#333' }}
            >
                <div className="text-8xl">{network?.icon || '🌐'}</div>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between relative z-10">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg border border-white/5 transition-transform group-hover/card:-rotate-6"
                        style={{ backgroundColor: `${network?.color || '#333'}20` }}
                    >
                        {network?.icon || '🌐'}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base text-white truncate max-w-[140px]">{contract.name || 'Unknown Token'}</h3>
                            <span className="text-[10px] text-zinc-500 font-mono tracking-tighter">({contract.symbol || '???'})</span>
                            {isVulnerable && <Flame size={14} className="text-warning animate-pulse" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-zinc-500 font-mono tracking-tight">{contract.address.slice(0, 8)}...{contract.address.slice(-6)}</span>
                            <button onClick={() => copyToClipboard(contract.address)} className="p-1 hover:bg-white/5 rounded text-zinc-600 hover:text-white transition-colors">
                                <Copy size={10} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                        <RefreshCw size={10} className="text-primary animate-pulse-slow" />
                        {formatTime(contract.timestamp)}
                    </span>
                    <div className={cn("badge text-[9px] font-black uppercase py-0.5 px-2 rounded border shadow-sm", getStatusColor())}>
                        {contract.tag} {contract.riskScore}%
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-black/20 rounded-lg p-1">
                <button
                    onClick={() => setViewMode('basic')}
                    className={cn(
                        "flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all",
                        viewMode === 'basic' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    OSINT
                </button>
                <button
                    onClick={() => setViewMode('advanced')}
                    className={cn(
                        "flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all",
                        viewMode === 'advanced' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    CODE & CHAIN
                </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[160px] flex flex-col gap-3">
                {viewMode === 'basic' ? (
                    <>
                        {/* Quick Specs */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-zinc-900/50 rounded-xl p-2.5 border border-white/[0.02]">
                                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                                    <Database size={12} />
                                    <p className="text-[9px] uppercase font-black tracking-widest">Type</p>
                                </div>
                                <span className="text-xs font-bold text-zinc-200">{contract.type || 'Standard'}</span>
                            </div>
                            <div className="bg-zinc-900/50 rounded-xl p-2.5 border border-white/[0.02]">
                                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                                    <Wallet size={12} />
                                    <p className="text-[9px] uppercase font-black tracking-widest">Deployer</p>
                                </div>
                                <span className="text-xs font-bold text-zinc-200">
                                    {contract.deployer ? `${contract.deployer.slice(0, 6)}...` : 'System'}
                                </span>
                            </div>
                        </div>

                        {/* Findings List */}
                        <div className="space-y-2">
                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">Risk Factors</p>
                            <div className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1">
                                {contract.findings && contract.findings.length > 0 ? (
                                    contract.findings.map((f, i) => (
                                        <div key={i} className="flex items-start gap-2 bg-zinc-900/30 rounded-lg p-2 border border-white/[0.01]">
                                            <div className={cn(
                                                "mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
                                                f.severity === 'CRITICAL' ? 'bg-danger shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-warning'
                                            )} />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-zinc-300 leading-tight">{f.type}</span>
                                                <span className="text-[9px] text-zinc-500 leading-tight">{f.description.slice(0, 50)}...</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-4 text-zinc-600 text-[10px] italic">No significant risks identified</div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="space-y-3 animate-in fade-in duration-300">
                        {/* Chain Context */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Block Index</p>
                                <p className="text-[10px] font-mono text-primary">#{contract.blockNumber || contract.block_number || 'PENDING'}</p>
                            </div>
                            <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">TX Registry</p>
                                <p className="text-[10px] font-mono text-zinc-400">
                                    {contract.txHash || contract.tx_hash ? `${(contract.txHash || contract.tx_hash).slice(0, 10)}...` : 'INTERNAL'}
                                </p>
                            </div>
                        </div>

                        {/* Bytecode Preview */}
                        <div className="flex-1 flex flex-col bg-black/60 rounded-xl p-3 border border-primary/10 min-h-[100px]">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 text-primary">
                                    <Code2 size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-tighter">Bytecode Snapshot</span>
                                </div>
                                <span className="text-[9px] text-zinc-600 font-mono">Size: {contract.bytecode_size || contract.bytecodeSize || '??'} bytes</span>
                            </div>
                            <div className="font-mono text-[9px] text-primary/60 break-all bg-black/40 p-2 rounded-lg border border-white/5 overflow-y-auto h-[60px] leading-relaxed">
                                {contract.bytecode || 'Scanning bytecode...'}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Features */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-auto">
                <div className="flex gap-1.5">
                    {contract.features && contract.features.slice(0, 2).map(f => (
                        <span key={f} className="text-[8px] bg-zinc-800/80 text-zinc-500 px-2 py-0.5 rounded-full uppercase font-black border border-white/[0.02]">
                            {f}
                        </span>
                    ))}
                    {contract.isMintable && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shadow-[0_0_5px_rgba(59,130,246,0.5)]" title="Mintable" />}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => copyToClipboard(contract.txHash || contract.tx_hash, 'Hash')}
                        className="p-1.5 bg-white/[0.02] hover:bg-white/5 text-zinc-600 hover:text-white rounded-lg transition-all"
                        title="Copy TX Hash"
                    >
                        <Search size={14} />
                    </button>
                    <a
                        href={getExplorerUrl()}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all shadow-sm"
                        title="View on Explorer"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* Glow Highlights */}
            {isVulnerable && (
                <div className={cn(
                    "absolute inset-x-0 bottom-0 h-[2px] animate-pulse-slow",
                    contract.tag === 'CRITICAL' ? "bg-gradient-to-r from-transparent via-danger to-transparent" : "bg-gradient-to-r from-transparent via-warning to-transparent"
                )} />
            )}
        </div>
    );
}
