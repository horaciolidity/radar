import React from 'react';
import { ShieldCheck, ShieldAlert, Zap, Lock, ExternalLink, Copy, AlertCircle, RefreshCw } from 'lucide-react';
import { cn, formatTimeAgo } from '../lib/utils';
import { NETWORKS } from '../data/mockData';

export default function ContractCard({ contract }) {
    const network = NETWORKS.find(n => n.id === contract.network);

    const copyAddress = () => {
        navigator.clipboard.writeText(contract.address);
        // Add some visual feedback if time permits
    };

    return (
        <div className="glass-card glass-card-hover rounded-2xl p-5 radar-scan group flex flex-col gap-4 relative">
            {/* Top Section: Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg border border-white/5"
                        style={{ backgroundColor: `${network?.color}20` }}
                    >
                        {network?.icon}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base group-hover:text-primary transition-colors">{contract.name}</h3>
                            <span className="text-[10px] text-zinc-500 font-mono tracking-tighter">({contract.symbol})</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-zinc-500 font-mono">{contract.address}</span>
                            <button
                                onClick={copyAddress}
                                className="p-1 hover:bg-white/5 rounded text-zinc-600 hover:text-white transition-colors"
                                title="Copy Address"
                            >
                                <Copy size={10} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                        <RefreshCw size={10} />
                        {formatTimeAgo(contract.createdAt)}
                    </span>
                    <div className={cn(
                        "badge",
                        contract.safety.status === 'safe' ? "bg-success/10 border-success/30 text-success" :
                            contract.safety.status === 'warning' ? "bg-warning/10 border-warning/30 text-warning" :
                                "bg-danger/10 border-danger/30 text-danger"
                    )}>
                        Safety Score: {contract.safety.score}/100
                    </div>
                </div>
            </div>

            {/* Middle Section: Stats Grid */}
            <div className="grid grid-cols-2 gap-3 py-1">
                <div className="bg-white/5 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Liquidity</p>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{contract.liquidity.amount}</span>
                        {contract.liquidity.locked ? (
                            <Lock size={12} className="text-success" />
                        ) : (
                            <Lock size={12} className="text-zinc-600" />
                        )}
                    </div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Market Cap</p>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{contract.mcap}</span>
                        <div className="text-[10px] text-zinc-500 font-mono">{contract.holders} H</div>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Indicators & Actions */}
            <div className="flex items-center justify-between pt-2 mt-auto border-t border-white/5">
                <div className="flex items-center gap-2">
                    {contract.isScam ? (
                        <div className="flex items-center gap-1 text-danger text-[10px] font-bold">
                            <ShieldAlert size={14} />
                            SCAM DETECTED
                        </div>
                    ) : contract.isVulnerable ? (
                        <div className="flex items-center gap-1 text-warning text-[10px] font-bold">
                            <AlertCircle size={14} />
                            VULNERABLE
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 text-success text-[10px] font-bold">
                            <ShieldCheck size={14} />
                            SECURE
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {contract.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">
                            {tag}
                        </span>
                    ))}
                    <a
                        href={`https://etherscan.io/address/${contract.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-primary/20 hover:text-primary rounded-lg transition-all text-zinc-500"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* Risk Overlay for Scams */}
            {contract.isScam && (
                <div className="absolute inset-0 bg-red-950/20 backdrop-blur-[1px] rounded-2xl pointer-events-none border border-red-500/20" />
            )}
        </div>
    );
}
