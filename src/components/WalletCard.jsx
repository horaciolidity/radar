import React from 'react';
import {
    Wallet, ExternalLink, Copy, TrendingUp, Clock,
    Globe, ShieldCheck, Zap, DollarSign, ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';

const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 3600000);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const formatUsd = (val) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
};

export default function WalletCard({ wallet }) {
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    const getExplorerUrl = () => {
        const explorers = {
            'Ethereum': 'https://etherscan.io',
            'BSC': 'https://bscscan.com',
            'Polygon': 'https://polygonscan.com',
            'Base': 'https://basescan.org',
            'Arbitrum': 'https://arbiscan.io',
            'Optimism': 'https://optimistic.etherscan.io'
        };
        const baseUrl = explorers[wallet.network] || 'https://etherscan.io';
        return `${baseUrl}/address/${wallet.address}`;
    };

    const isWhale = wallet.balance_usd > 100000;
    const isMedium = wallet.balance_usd > 10000;

    return (
        <div className={cn(
            "glass-card group/wallet transition-all duration-500 rounded-3xl p-6 border relative overflow-hidden",
            isWhale ? "border-primary/30 bg-primary/[0.03]" : "border-white/5 bg-white/[0.01] hover:bg-white/[0.02]"
        )}>
            {/* Background Glow */}
            <div className={cn(
                "absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-10 pointer-events-none transition-all duration-1000 group-hover/wallet:opacity-20",
                isWhale ? "bg-primary" : "bg-zinc-500"
            )} />

            {/* Header */}
            <div className="flex items-start justify-between relative z-10 mb-6">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-2xl border transition-all duration-500 group-hover/wallet:scale-110 group-hover/wallet:rotate-3",
                        isWhale ? "bg-primary/20 border-primary/20 text-primary shadow-primary/20" : "bg-zinc-800/50 border-white/5 text-zinc-400"
                    )}>
                        <Wallet size={28} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-black text-lg text-white tracking-tight">
                                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                            </h3>
                            {isWhale && (
                                <div className="flex items-center gap-1 bg-primary/20 text-primary text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-primary/30">
                                    <Zap size={8} /> Whale
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                                <Globe size={10} /> {wallet.network}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-black text-white italic tracking-tighter">
                        {formatUsd(wallet.balance_usd)}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 flex items-center justify-end gap-1 mt-1 uppercase">
                        <TrendingUp size={10} className="text-success" />
                        {wallet.balance_eth.toFixed(4)} NATIVE
                    </div>
                </div>
            </div>

            {/* Stats / Details */}
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                <div className="bg-black/40 rounded-2xl p-4 border border-white/5 transition-colors group-hover/wallet:border-white/10">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                        <Clock size={12} />
                        <span className="text-[9px] uppercase font-black tracking-widest">Last Activity</span>
                    </div>
                    <div className="text-sm font-bold text-zinc-200">
                        {formatTime(wallet.last_seen)}
                    </div>
                </div>
                <div className="bg-black/40 rounded-2xl p-4 border border-white/5 transition-colors group-hover/wallet:border-white/10">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                        <ShieldCheck size={12} />
                        <span className="text-[9px] uppercase font-black tracking-widest">Status</span>
                    </div>
                    <div className={cn(
                        "text-sm font-bold uppercase italic",
                        isWhale ? "text-primary" : "text-success"
                    )}>
                        High Value
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-5 border-t border-white/5 relative z-10">
                <div className="flex gap-2">
                    <button
                        onClick={() => copyToClipboard(wallet.address)}
                        className="px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                        <Copy size={12} /> Copy
                    </button>
                    <a
                        href={getExplorerUrl()}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                        <ExternalLink size={12} /> Explorer
                    </a>
                </div>
                <button className="w-10 h-10 bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center rounded-xl transition-all group/btn">
                    <ArrowRight size={18} className="transition-transform group-hover/btn:translate-x-1" />
                </button>
            </div>

            {/* Whale Animation Overlay */}
            {isWhale && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
            )}
        </div>
    );
}
