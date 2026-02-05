import React from 'react';
import { Radar, Bell, Search, Wallet, TrendingUp } from 'lucide-react';

export default function Header({ account, onConnect, onSearch }) {
    return (
        <header className="sticky top-0 z-50 w-full glass-card border-b py-4">
            <div className="container mx-auto px-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Radar className="w-8 h-8 text-primary animate-pulse" />
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full -z-10" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            CONTRACT RADAR
                        </h1>
                        <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
                            Real-time Analysis Engine
                        </p>
                    </div>
                </div>

                <nav className="hidden md:flex items-center gap-8">
                    <a href="#" className="text-sm font-medium text-white hover:text-primary transition-colors flex items-center gap-2">
                        <TrendingUp size={16} />
                        Trending
                    </a>
                    <a href="#" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Alerts</a>
                    <a href="#" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Watchlist</a>
                    <a href="#" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Portfolio</a>
                </nav>

                <div className="flex items-center gap-4">
                    <div className="relative hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search address (0x...)"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onSearch?.(e.target.value);
                                    e.target.value = '';
                                }
                            }}
                            className="bg-zinc-900/50 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 w-64 transition-all"
                        />
                    </div>
                    <button className="relative p-2 text-zinc-400 hover:text-white transition-colors">
                        <Bell size={20} />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background" />
                    </button>
                    <button
                        onClick={onConnect}
                        className="btn-primary flex items-center gap-2 text-sm px-5 py-2 min-w-[140px] justify-center"
                    >
                        <Wallet size={16} />
                        {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
                    </button>
                </div>
            </div>
        </header>
    );
}
