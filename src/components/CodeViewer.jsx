import React, { useMemo, useEffect, useRef } from 'react';

// Lightweight visualizer that doesn't trigger TronLink/SES security locks
const CodeViewer = ({ code, vulnerabilities, selectedVuln, onLineClick }) => {
    const scrollRef = useRef(null);

    // Simple Solidity Syntax Highlighter
    const highlightedCode = useMemo(() => {
        if (!code) return [];
        return code.split('\n').map((line, i) => {
            // Basic tokenization for display purposes
            let content = line;

            // Highlight comments
            if (content.trim().startsWith('//')) {
                return <span key={i} className="text-zinc-500 italic">{content}</span>;
            }

            // Simple keyword highlighting logic using regex replacement would be complex in pure JSX map 
            // So we stick to a clean mono-color with specific keywords highlighted via simple splits or leave perfectly clean
            // For a "Pro" feel, clean white text on dark background is standard for readers

            // Let's at least highlight logical keywords
            const keywords = ['function', 'contract', 'address', 'uint256', 'bool', 'public', 'private', 'external', 'internal', 'view', 'returns', 'require', 'if', 'else', 'for', 'emit', 'event', 'pragma', 'solidity', 'import'];

            // This is a naive highlight for demo speed, usually you'd use a parser
            // But this keeps it 100% crash-free
            return (
                <span key={i} className="text-zinc-300 font-mono text-[13px]">
                    {content}
                </span>
            );
        });
    }, [code]);

    // Scroll to selected vulnerability
    useEffect(() => {
        if (selectedVuln && scrollRef.current) {
            const lineEl = document.getElementById(`line-${selectedVuln.startLine}`);
            if (lineEl) {
                lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedVuln]);

    return (
        <div className="h-full w-full bg-[#0d1117] overflow-hidden rounded-xl border border-white/5 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="bg-[#161b22] px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 ml-4 uppercase tracking-[0.2em]">
                        High-Performance Viewer
                    </span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-white/5">
                    Read-Only Mode
                </div>
            </div>

            {/* Code Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-auto custom-scrollbar relative p-4"
            >
                <div className="min-w-fit">
                    {code ? code.split('\n').map((lineContent, index) => {
                        const lineNum = index + 1;

                        // Check if this line is part of a vulnerability
                        const vuln = vulnerabilities?.find(v => lineNum >= v.startLine && lineNum <= v.endLine);

                        // Risk colors
                        let bgClass = "transparent";
                        let borderClass = "transparent";

                        if (vuln) {
                            if (vuln.severity === 'CRITICAL') {
                                bgClass = "bg-red-500/10";
                                borderClass = "border-l-2 border-red-500";
                            } else if (vuln.severity === 'HIGH') {
                                bgClass = "bg-orange-500/10";
                                borderClass = "border-l-2 border-orange-500";
                            } else if (vuln.severity === 'MEDIUM') {
                                bgClass = "bg-yellow-500/10";
                                borderClass = "border-l-2 border-yellow-500";
                            } else {
                                bgClass = "bg-blue-500/10";
                                borderClass = "border-l-2 border-blue-500";
                            }
                        }

                        // Selected State
                        const isSelected = selectedVuln && lineNum >= selectedVuln.startLine && lineNum <= selectedVuln.endLine;
                        if (isSelected) {
                            bgClass = vuln?.severity === 'CRITICAL' ? "bg-red-500/20" : "bg-primary/10";
                        }

                        // Highlighting keyword logic (Simple Naive implementation)
                        // We rebuild the line content for simple coloring
                        const formattedLine = lineContent.split(/(\s+)/).map((part, pIdx) => {
                            const keywords = ['contract', 'library', 'interface', 'function', 'modifier', 'event', 'constructor', 'address', 'uint256', 'bool', 'string', 'public', 'external', 'internal', 'private', 'view', 'pure', 'returns', 'memory', 'storage', 'calldata', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return', 'throw', 'emit', 'require', 'revert', 'assert', 'mapping', 'struct', 'enum', 'this', 'super', 'new', 'delete', 'true', 'false', 'msg', 'block', 'tx', 'now'];

                            if (lineContent.trim().startsWith('//') || lineContent.trim().startsWith('*') || lineContent.trim().startsWith('/*')) {
                                return <span key={pIdx} className="text-zinc-500 italic">{part}</span>;
                            }

                            if (keywords.includes(part)) {
                                return <span key={pIdx} className="text-primary font-bold">{part}</span>;
                            }

                            if (part.startsWith('"') || part.startsWith("'")) {
                                return <span key={pIdx} className="text-green-400">{part}</span>;
                            }

                            return <span key={pIdx} className="text-zinc-300">{part}</span>;
                        });

                        return (
                            <div
                                key={lineNum}
                                id={`line-${lineNum}`}
                                onClick={() => onLineClick(lineNum)}
                                className={`flex group hover:bg-white/5 cursor-pointer transition-colors ${bgClass} ${borderClass}`}
                            >
                                {/* Line Number */}
                                <div className="w-12 shrink-0 text-right pr-4 select-none text-zinc-700 font-mono text-xs pt-0.5 group-hover:text-zinc-500">
                                    {lineNum}
                                </div>

                                {/* Code Content */}
                                <div className="font-mono text-[13px] whitespace-pre tab-4">
                                    {formattedLine}
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="text-zinc-600 italic p-4">No code loaded...</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CodeViewer;
