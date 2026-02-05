import React, { useState, useEffect } from 'react';
import { Search, ShieldAlert, Cpu, Database, Network, FileCode, CheckCircle2, AlertTriangle, Info, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import RiskScoreBar from './RiskScoreBar';
import CodeViewer from './CodeViewer';
import VulnerabilityPanel from './VulnerabilityPanel';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const AuditPage = () => {
    const [inputMode, setInputMode] = useState('address'); // 'address' | 'manual'
    const [address, setAddress] = useState('');
    const [network, setNetwork] = useState('Ethereum');
    const [manualCode, setManualCode] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [auditResult, setAuditResult] = useState(null);
    const [selectedVuln, setSelectedVuln] = useState(null);
    const [analysisSteps, setAnalysisSteps] = useState([]);

    const NETWORKS = ['Ethereum', 'BSC', 'Polygon', 'Base', 'Arbitrum', 'Optimism'];

    const addStep = (msg, status = 'loading') => {
        setAnalysisSteps(prev => [...prev, { id: Date.now(), msg, status }]);
    };

    const updateLastStep = (status) => {
        setAnalysisSteps(prev => {
            const next = [...prev];
            if (next.length > 0) {
                next[next.length - 1].status = status;
            }
            return next;
        });
    };

    const runAudit = async () => {
        if (inputMode === 'address' && !address.startsWith('0x')) {
            alert("Please enter a valid address");
            return;
        }
        if (inputMode === 'manual' && manualCode.length < 50) {
            alert("Code too short for analysis");
            return;
        }

        setIsAnalyzing(true);
        setAnalysisSteps([]);
        setAuditResult(null);

        try {
            addStep(`Initializing analysis for ${inputMode === 'address' ? address : 'manual code'}...`, 'done');

            addStep("Fetching source code and metadata...");
            // Simulate/Trigger API
            const response = await fetch('/api/audit-contract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: inputMode === 'address' ? address : null,
                    network: inputMode === 'address' ? network : null,
                    code: inputMode === 'manual' ? manualCode : null
                })
            });

            updateLastStep('done');
            addStep("Running static analysis (Securify/Slither rules)...");

            // Wait a bit to simulate processing
            await new Promise(r => setTimeout(r, 1500));
            updateLastStep('done');

            addStep("Executing Semantic AI Review...");
            await new Promise(r => setTimeout(r, 2000));
            updateLastStep('done');

            const data = await response.json();

            if (data.success) {
                setAuditResult(data.audit);
            } else {
                throw new Error(data.error || "Analysis failed");
            }
        } catch (err) {
            console.error(err);
            addStep(`Error: ${err.message}`, 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto py-6">
            {!auditResult && !isAnalyzing ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-1 flex flex-col items-center justify-center space-y-12 py-12"
                >
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-4">
                            <ShieldAlert size={18} />
                            <span className="text-xs font-black uppercase tracking-widest">Next-Gen Auditor</span>
                        </div>
                        <h1 className="text-6xl font-black italic text-white uppercase tracking-tighter">
                            Visual <span className="text-primary tracking-normal">Audit</span> Engine
                        </h1>
                        <p className="text-zinc-500 max-w-2xl mx-auto text-lg">
                            Identify reentrancy, honeypots, and rug-pull risks using combined static analysis and semantic AI scanning.
                        </p>
                    </div>

                    <div className="w-full max-w-2xl glass-card p-8 space-y-8">
                        {/* Toggle Mode */}
                        <div className="flex p-1 bg-surface-lighter rounded-xl border border-white/5">
                            <button
                                onClick={() => setInputMode('address')}
                                className={cn(
                                    "flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                    inputMode === 'address' ? "bg-primary text-black" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                Contract Address
                            </button>
                            <button
                                onClick={() => setInputMode('manual')}
                                className={cn(
                                    "flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                    inputMode === 'manual' ? "bg-primary text-black" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                Paste Code
                            </button>
                        </div>

                        {inputMode === 'address' ? (
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-black text-zinc-500 uppercase ml-1">Network</label>
                                        <select
                                            value={network}
                                            onChange={(e) => setNetwork(e.target.value)}
                                            className="w-full bg-surface-lighter border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 ring-primary/50 appearance-none cursor-pointer"
                                        >
                                            {NETWORKS.map(nw => <option key={nw} value={nw}>{nw}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-[2] space-y-2">
                                        <label className="text-[10px] font-black text-zinc-500 uppercase ml-1">Contract Address</label>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                                            <input
                                                type="text"
                                                placeholder="0x..."
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                className="w-full bg-surface-lighter border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 ring-primary/50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase ml-1">Solidity Code</label>
                                <textarea
                                    placeholder="/* Paste your Solidity code here */"
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    className="w-full h-48 bg-surface-lighter border border-white/10 rounded-xl p-4 text-white font-mono text-sm placeholder:text-zinc-700 focus:outline-none focus:ring-2 ring-primary/50 resize-none"
                                />
                            </div>
                        )}

                        <button
                            onClick={runAudit}
                            className="w-full bg-primary hover:bg-primary-hover text-black font-black uppercase italic tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(163,230,53,0.3)] transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                        >
                            <Cpu size={20} />
                            Analyze Smart Contract
                        </button>
                    </div>

                    <div className="flex gap-12 text-zinc-600">
                        <div className="flex items-center gap-2">
                            <Network size={16} /> <span className="text-[10px] font-mono">Multi-Chain Verified</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <FileCode size={16} /> <span className="text-[10px] font-mono">Static & AI Analysis</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Database size={16} /> <span className="text-[10px] font-mono">Supabase Sync</span>
                        </div>
                    </div>
                </motion.div>
            ) : isAnalyzing ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                    <div className="relative">
                        <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        <Cpu className="absolute inset-0 m-auto text-primary animate-pulse" size={32} />
                    </div>
                    <div className="w-full max-w-md space-y-4">
                        <h3 className="text-xl font-bold text-white text-center italic uppercase leading-tight">
                            Scanning security <span className="text-primary">vectors</span>...
                        </h3>
                        <div className="space-y-2 bg-surface p-4 rounded-2xl border border-white/5">
                            {analysisSteps.map((step) => (
                                <div key={step.id} className="flex items-center gap-3 text-xs font-mono">
                                    {step.status === 'loading' ? (
                                        <div className="w-3 h-3 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                                    ) : step.status === 'done' ? (
                                        <CheckCircle2 size={12} className="text-primary" />
                                    ) : (
                                        <AlertTriangle size={12} className="text-red-500" />
                                    )}
                                    <span className={step.status === 'loading' ? 'text-white' : 'text-zinc-500'}>{step.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-12 gap-6 h-[calc(100vh-180px)]">
                    {/* Header Area */}
                    <div className="col-span-12 flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setAuditResult(null)}
                                className="p-2 rounded-lg bg-surface hover:bg-white/5 text-zinc-500 hover:text-white transition-all border border-white/5"
                            >
                                <Search size={18} />
                            </button>
                            <div>
                                <h2 className="text-xl font-black text-white italic truncate max-w-sm uppercase">
                                    {auditResult.name || 'Contract Audit'}
                                </h2>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                                    <span className="text-primary">{auditResult.network || 'Manual'}</span>
                                    <span>•</span>
                                    <span>{auditResult.address || 'Hash: ' + auditResult.hash?.slice(0, 10) + '...'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-white/5 border border-white/5 rounded-xl text-xs font-bold text-zinc-400 transition-all">
                                <Terminal size={14} /> Export Report
                            </button>
                        </div>
                    </div>

                    {/* Left Panel: Score and Findings */}
                    <div className="col-span-3 space-y-6">
                        <div className="glass-card p-6">
                            <RiskScoreBar score={auditResult.riskScore} />
                        </div>

                        <div className="flex-1 overflow-hidden h-[calc(100%-140px)]">
                            <VulnerabilityPanel
                                vulnerabilities={auditResult.vulnerabilities}
                                onSelect={(v) => setSelectedVuln(v)}
                                selectedId={selectedVuln?.id}
                            />
                        </div>
                    </div>

                    {/* Center/Right: Code Explorer */}
                    <div className="col-span-9 flex flex-col gap-6 h-full">
                        <div className="flex-1 min-h-0 bg-surface rounded-2xl border border-white/5 overflow-hidden">
                            <CodeViewer
                                code={auditResult.code}
                                vulnerabilities={auditResult.vulnerabilities}
                                selectedVuln={selectedVuln}
                                onLineClick={(line) => {
                                    const v = auditResult.vulnerabilities.find(vl => line >= vl.startLine && line <= vl.endLine);
                                    if (v) setSelectedVuln(v);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditPage;
