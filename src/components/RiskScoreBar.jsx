import React from 'react';
import { motion } from 'framer-motion';

const RiskScoreBar = ({ score }) => {
    const getScoreColor = (s) => {
        if (s >= 80) return 'text-red-500 bg-red-500/10 border-red-500/20';
        if (s >= 50) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
        if (s >= 20) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
        return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    };

    const getProgressColor = (s) => {
        if (s >= 80) return 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
        if (s >= 50) return 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]';
        if (s >= 20) return 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]';
        return 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]';
    };

    const getScoreLabel = (s) => {
        if (s >= 80) return 'CRITICAL RISK';
        if (s >= 50) return 'HIGH RISK';
        if (s >= 20) return 'MEDIUM RISK';
        return 'LOW RISK';
    };

    return (
        <div className="w-full space-y-4">
            <div className="flex items-end justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border tracking-tighter ${getScoreColor(score)}`}>
                            {getScoreLabel(score)}
                        </span>
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em]">Security Rating</span>
                    </div>
                    <div className="text-4xl font-black italic text-white flex items-baseline gap-1">
                        {score}<span className="text-sm text-zinc-500 not-italic">/100</span>
                    </div>
                </div>
            </div>

            <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`absolute inset-y-0 left-0 rounded-full transition-colors duration-500 ${getProgressColor(score)}`}
                />
                {/* Indicators */}
                <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
                    {[20, 40, 60, 80].map(mark => (
                        <div key={mark} className="w-[1px] h-full bg-white/10" />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default RiskScoreBar;
