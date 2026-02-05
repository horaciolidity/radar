import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

const CodeViewer = ({ code, vulnerabilities, selectedVuln, onLineClick }) => {
    const editorRef = useRef(null);
    const decorationsRef = useRef([]);

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;

        // Apply decorations
        updateDecorations(editor, monaco);

        editor.onMouseDown((e) => {
            const line = e.target.position?.lineNumber;
            if (line) onLineClick(line);
        });
    };

    const updateDecorations = (editor, monaco) => {
        if (!editor || !monaco) return;

        const newDecorations = vulnerabilities.map((vuln) => {
            let className = '';
            let glyphClassName = '';

            switch (vuln.severity.toLowerCase()) {
                case 'critical':
                    className = 'bg-red-500/20 rounded-sm';
                    glyphClassName = 'bg-red-500 w-1 ml-1';
                    break;
                case 'high':
                    className = 'bg-orange-500/20 rounded-sm';
                    glyphClassName = 'bg-orange-500 w-1 ml-1';
                    break;
                case 'medium':
                    className = 'bg-yellow-500/20 rounded-sm';
                    glyphClassName = 'bg-yellow-500 w-1 ml-1';
                    break;
                case 'informative':
                    className = 'bg-blue-500/20 rounded-sm';
                    glyphClassName = 'bg-blue-500 w-1 ml-1';
                    break;
            }

            return {
                range: new monaco.Range(vuln.startLine, 1, vuln.endLine, 1),
                options: {
                    isWholeLine: true,
                    className: className,
                    glyphMarginClassName: glyphClassName,
                    hoverMessage: { value: `**${vuln.title}**\n\n${vuln.explanation}` }
                },
            };
        });

        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    };

    useEffect(() => {
        if (editorRef.current) {
            // If a specific vulnerability is selected, scroll to it
            if (selectedVuln) {
                editorRef.current.revealLineInCenter(selectedVuln.startLine);

                // Highlight selected vulnerability even more
                // (Optional: add a special decoration for the selected one)
            }
        }
    }, [selectedVuln]);

    return (
        <div className="h-full w-full bg-[#1e1e1e] overflow-hidden rounded-xl border border-white/5 shadow-2xl">
            <div className="bg-[#252526] px-4 py-2 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40" />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 ml-4 uppercase tracking-[0.2em]">Smart Contract Source</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-white/5">
                    Solidity 0.8.x
                </div>
            </div>
            <Editor
                height="100%"
                defaultLanguage="solidity"
                theme="vs-dark"
                value={code || '// No code loaded'}
                onMount={handleEditorDidMount}
                options={{
                    readOnly: true,
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    glyphMargin: true,
                    folding: true,
                    lineDecorationsWidth: 10,
                    contextmenu: false,
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: "on",
                    padding: { top: 20 },
                    renderLineHighlight: 'all',
                    scrollbar: {
                        vertical: 'visible',
                        horizontal: 'visible',
                        useShadows: false,
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10
                    }
                }}
            />
        </div>
    );
};

export default CodeViewer;
