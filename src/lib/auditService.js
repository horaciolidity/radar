import { supabase } from './supabase';
import { contractManager } from './contractManager'; // Helper to get providers

// ==========================================
// 1. ADVANCED SECURITY RULES (SOURCE CODE)
// ==========================================
const analyzeSecurity = (code) => {
    const findings = [];
    // Normalize code for easier matching (remove excessive whitespace)
    const normalizedCode = code.replace(/\r/g, '').split('\n');
    let vulnCounter = 1;

    const addFinding = (title, severity, lineIdx, description, justification, exploitTestable = false) => {
        let color = 'green';
        if (severity === 'critical') color = 'red';
        else if (severity === 'medium') color = 'yellow';
        else if (severity === 'low') color = 'green';

        findings.push({
            id: `SC-${String(vulnCounter++).padStart(3, '0')}`,
            severity,
            color,
            title,
            description,
            functions: [], // Parser enhancement needed to identify function scope
            lines: [lineIdx + 1, lineIdx + 1],
            exploitTestable,
            justification
        });
    };

    normalizedCode.forEach((line, i) => {
        const content = line.trim();
        const lowerContent = content.toLowerCase();

        if (content.startsWith('//') || content.startsWith('*') || content.startsWith('/*')) return;

        // -----------------------------
        // A. CRITICAL SCAM PATTERNS
        // -----------------------------

        // 1. Honeypot: Restricted Transfer (Generic restrictive logic)
        if (
            (lowerContent.includes('require') || lowerContent.includes('revert')) &&
            (lowerContent.includes('tradingopen') || lowerContent.includes('allowed') || lowerContent.includes('blacklist') || lowerContent.includes('isbot')) &&
            !lowerContent.includes('owner')
        ) {
            addFinding('Potential Honeypot Logic', 'critical', i,
                'Transfer appears conditionally restricted based on custom flags (tradingOpen, isBot, etc). Recommendation: Verify these restrictions cannot be abused to lock funds.',
                'Users might be unable to sell if the owner disables trading or blacklists them.',
                true);
        }

        // 2. Hidden Mint / Balance Manipulation
        if (
            (lowerContent.includes('test') || lowerContent.includes('setbalance') || lowerContent.includes('addlog') || lowerContent.includes('swapandliquify')) &&
            (lowerContent.includes('+=') || lowerContent.includes('=')) &&
            lowerContent.includes('balance') &&
            !lowerContent.includes('emit')
        ) {
            // Heuristic: Strange balance updates outside standard transfer
            if (lowerContent.includes('_balances[sender] =') || lowerContent.includes('_basictransfer')) {
                addFinding('Non-Standard Balance Update', 'critical', i,
                    'Balances are being modified in a non-standard way. Recommendation: Ensure strictly standard ERC20 transfer logic.',
                    'Risk of hidden minting or balance spoofing.',
                    true);
            }
        }

        // -----------------------------
        // B. DANGEROUS PERMISSIONS
        // -----------------------------

        // 3. Blacklist Capabilities
        if (lowerContent.includes('blacklist') || lowerContent.includes('bot') || lowerContent.includes('antisniper')) {
            if (lowerContent.includes('mapping')) {
                addFinding('Blacklist Mechanism', 'medium', i,
                    'Contract contains a blacklist/bot mapping. Recommendation: Check owner privileges.',
                    'Owner can arbitrarily block addresses from trading. Centralized control over user assets.',
                    false);
            }
        }

        // 4. Fee Manipulation (High Tax)
        if ((lowerContent.includes('setfee') || lowerContent.includes('settax') || lowerContent.includes('updatefees')) && lowerContent.includes('function')) {
            addFinding('Mutable Feerate', 'medium', i,
                'Owner can change the tax/fee rate. Recommendation: Ensure there is a hard cap (e.g. max 25%) in the code.',
                'Owner could set fees to 100% (Honeypot).',
                false);
        }

        // 5. Max Transaction / Wallet Limits
        if ((lowerContent.includes('maxtextamount') || lowerContent.includes('maxwallet') || lowerContent.includes('_maxtxamount')) && (lowerContent.includes('set') || lowerContent.includes('update'))) {
            addFinding('Mutable Transaction Limits', 'medium', i,
                'Owner can change max transaction or wallet limits. Recommendation: Check for lower bounds (MIN keys).',
                'Can be used to effectively stop trading (set limit to 0).',
                false);
        }

        // -----------------------------
        // C. TECHNICAL VULNERABILITIES
        // -----------------------------

        // 6. Reentrancy
        if (content.includes('.call{value:') && !lowerContent.includes('nonreentrant')) {
            addFinding('Potential Reentrancy', 'critical', i,
                'Low-level call used to transfer ETH without reentrancy guard. Recommendation: Use ReentrancyGuard/nonReentrant.',
                'Attackers can drain funds by recursively calling.',
                true);
        }

        // 7. Delegatecall
        if (content.includes('delegatecall')) {
            addFinding('Unsafe Delegatecall', 'critical', i,
                'Contract executes code from another address. Recommendation: Verify target trust.',
                'If target is malicious, contract can be destroyed or manipulated.',
                true);
        }

        // 8. Self Destruct
        if (content.includes('selfdestruct')) {
            addFinding('Self Destruct', 'medium', i,
                'Can verify destroy contract. Recommendation: Remove unless necessary.',
                'Rug pull risk.',
                true);
        }

        // 9. Weak Randomness
        if ((content.includes('block.difficulty') || content.includes('block.timestamp')) && (content.includes('%'))) {
            addFinding('Weak Randomness', 'low', i,
                'Using block attributes for RNG. Recommendation: Use Chainlink VRF.',
                'Miners can manipulate result.',
                true);
        }

        // 10. Tx.Origin
        if (content.includes('tx.origin')) {
            addFinding('Tx.Origin Phishing', 'medium', i,
                'Authorization using tx.origin. Recommendation: Use msg.sender.',
                'Phishing risk.',
                true);
        }
    });

    return { findings };
};

// ==========================================
// 2. BYTECODE ANALYSIS (UNVERIFIED CONTRACTS)
// ==========================================
const analyzeBytecode = (bytecode) => {
    const findings = [];
    let vulnCounter = 1;

    const addBCodeFinding = (title, severity, description, justification) => {
        let color = 'green';
        if (severity === 'critical') color = 'red';
        else if (severity === 'medium') color = 'yellow';

        findings.push({
            id: `BC-${String(vulnCounter++).padStart(3, '0')}`,
            severity,
            color,
            title,
            description,
            functions: [],
            lines: [1, 1],
            exploitTestable: true,
            justification
        });
    };

    // Check for SELFDESTRUCT opcode (0xff)
    if (bytecode.includes('ff')) {
        addBCodeFinding('Self-Destruct Opcode Detected', 'medium',
            'The compiled bytecode contains the SELFDESTRUCT opcode (0xFF). Recommendation: Verify source code.',
            'Contract can be destroyed.');
    }

    // Check for DELEGATECALL (0xf4)
    if (bytecode.includes('f4')) {
        addBCodeFinding('Delegatecall Opcode Detected', 'medium',
            'The compiled bytecode contains DELEGATECALL (0xF4). Recommendation: Verify source to ensure delegate target is safe.',
            'Contract relies on external logic.');
    }

    return findings;
};

// ==========================================
// 3. EXPLORER / NETWORK UTILS
// ==========================================
const EXPLORER_APIS = {
    'Ethereum': 'https://api.etherscan.io/api',
    'BSC': 'https://api.bscscan.com/api',
    'Polygon': 'https://api.polygonscan.com/api',
    'Base': 'https://api.basescan.org/api',
    'Arbitrum': 'https://api.arbiscan.io/api',
    'Optimism': 'https://api-optimistic.etherscan.io/api',
    'Avalanche': 'https://api.snowtrace.io/api',
    'Fantom': 'https://api.ftmscan.com/api',
    'Cronos': 'https://api.cronoscan.com/api',
    'Moonbeam': 'https://api-moonbeam.moonscan.io/api',
    'Gnosis': 'https://api.gnosisscan.io/api'
};

const fetchSourceCode = async (address, network) => {
    const apiUrl = EXPLORER_APIS[network];
    if (!apiUrl) return null;

    try {
        const response = await fetch(`${apiUrl}?module=contract&action=getsourcecode&address=${address}`);
        const data = await response.json();

        if (data.status !== '1' || !data.result || data.result.length === 0) return null;

        const sourceInfo = data.result[0];

        // Proxy Handling
        if (sourceInfo.Proxy === "1" && sourceInfo.Implementation && sourceInfo.Implementation !== address) {
            const implSource = await fetchSourceCode(sourceInfo.Implementation, network);
            if (implSource) {
                return `// *** PROXY DETECTED ***\n// Implementation: ${sourceInfo.Implementation}\n\n` + implSource;
            }
        }

        if (sourceInfo.SourceCode) {
            // Clean result
            let cleanCode = sourceInfo.SourceCode;
            if (cleanCode.startsWith('{{')) {
                try {
                    const parsed = JSON.parse(cleanCode.slice(1, -1)); // Remove outer {}
                    if (parsed.sources) {
                        cleanCode = Object.entries(parsed.sources)
                            .map(([key, val]) => `// File: ${key}\n\n${val.content}`)
                            .join('\n\n');
                    }
                } catch (e) { /* ignore parse error */ }
            }
            return cleanCode;
        }
        return null;
    } catch (e) {
        console.warn("Explorer fetch failed", e);
        return null;
    }
};

// ==========================================
// 4. MAIN SERVICE EXPORT
// ==========================================
import { AUDIT_PROMPT, EXPLOIT_PROMPT, VERIFY_PROMPT, UPGRADE_EXPLOIT_PROMPT } from './aiPrompt';

export const auditService = {
    // OpenAI/Anthropic Integration Placeholder
    async performAIAudit(code, network, apiKey) {
        /* 
           IMPLEMENTATION GUIDE:
           1. Replace {{CODE}} in AUDIT_PROMPT ...
        */
        const prompt = AUDIT_PROMPT
            .replace('{{CODE}}', code || '// No code');

        console.log("Ready to send prompt:", prompt);
        return { findings: [] }; // Mock
    },

    async generateExploit(code, finding) {
        // Construct the prompt with the specific finding context
        const prompt = EXPLOIT_PROMPT
            .replace('{{CODE}}', code)
            .replace('{{FINDING_JSON}}', JSON.stringify(finding, null, 2));

        console.log("Generating exploit with prompt length:", prompt.length);

        try {
            const response = await fetch('/api/generate-exploit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();

            if (!data.success) {
                // Determine if it is a missing key error
                if (data.error && data.error.includes("GEMINI_API_KEY")) {
                    throw new Error("SERVER_MISSING_KEY");
                }
                throw new Error(data.error || "Failed to generate exploit");
            }

            return { success: true, exploit: data.exploit };
        } catch (error) {
            console.error("Exploit generation error:", error);
            // Fallback for demo if backend is offline or key missing.
            if (error.message === "SERVER_MISSING_KEY" || error.message.includes("GEMINI_API_KEY")) {
                alert("Please add your FREE Google Gemini API Key to server/.env (variable GEMINI_API_KEY) to use this feature!");
                return { success: false, error: "Missing API Key" };
            }
            return { success: false, error: error.message };
        }
    },

    async verifyExploit(vulnerabilityId, testLogs) {
        const prompt = VERIFY_PROMPT
            .replace('{{TEST_LOGS}}', testLogs);

        console.log("Verifying exploit with prompt length:", prompt.length);

        try {
            const response = await fetch('/api/verify-exploit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();
            return { ...data, vulnerabilityId }; // ensuring ID persists
        } catch (error) {
            console.error("Verification error:", error);
            // Fallback for missing key warning
            if (error.message === "SERVER_MISSING_KEY") {
                alert("Please add your FREE Google Gemini API Key to server/.env (variable GEMINI_API_KEY) to use this feature!");
            }
            return {
                vulnerabilityId,
                verification: "inconclusive",
                finalSeverity: "medium",
                updatedRiskScore: 0,
                notes: "AI Verification service unavailable: " + error.message
            };
        }
    },

    async upgradeExploit(testCode, contractCode) {
        // Construct the prompt with the specific test and contract context
        const prompt = UPGRADE_EXPLOIT_PROMPT
            .replace('{{TEST_CODE}}', testCode)
            .replace('{{CONTRACT_CODE}}', contractCode || 'No contract code provided');

        console.log("Upgrading exploit with prompt length:", prompt.length);

        try {
            const response = await fetch('/api/upgrade-exploit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "Failed to upgrade exploit");
            }

            return { success: true, code: data.code };
        } catch (error) {
            console.error("Exploit upgrade error:", error);
            return { success: false, error: error.message };
        }
    },

    async performAudit({ address, network, code: manualCode }) {
        try {
            let sourceCode = manualCode;
            let name = 'Audit Report';
            let combinedFindings = [];

            // Case 1: Manual Code Paste
            if (!address && manualCode) {
                name = 'Manual Analysis';
                const analysis = analyzeSecurity(manualCode);
                combinedFindings = analysis.findings;
            }

            // Case 2: Address Search
            else if (address && network) {
                // A. Try to fetch Source Code
                sourceCode = await fetchSourceCode(address, network);

                if (sourceCode) {
                    name = `Audit: ${address.slice(0, 8)}... (${network})`;
                    const analysis = analyzeSecurity(sourceCode);
                    combinedFindings = analysis.findings;
                } else {
                    // B. Fallback to Bytecode Analysis (Unverified)
                    name = `UNVERIFIED: ${address.slice(0, 8)}...`;

                    try {
                        const provider = contractManager.getProvider(network);
                        if (provider) {
                            sourceCode = await provider.getCode(address);
                            if (sourceCode === '0x') throw new Error("Contract does not exist");

                            // Analyze Bytecode
                            combinedFindings = analyzeBytecode(sourceCode);

                            // Prepare display for the viewer
                            sourceCode = `// ⚠️ CONTRACT SOURCE CODE NOT VERIFIED\n// ⚠️ DISPLAYING RAW BYTECODE ANALYSIS\n\n// Address: ${address}\n// Network: ${network}\n\n` +
                                `// Analysis Findings:\n` +
                                (combinedFindings.length > 0 ? combinedFindings.map(v => `// - [${v.severity}] ${v.title}`).join('\n') : '// - No obvious bytecode hazards found (ff/f4)') +
                                `\n\n// Raw Bytecode:\n` + sourceCode;
                        } else {
                            throw new Error("Could not connect to network provider");
                        }
                    } catch (err) {
                        throw new Error(`Analysis failed: ${err.message}`);
                    }
                }
            }

            // Calculate Summary
            let critical = 0, medium = 0, low = 0;
            let score = 0;

            combinedFindings.forEach(v => {
                if (v.severity === 'critical') {
                    critical++;
                    score += 40;
                } else if (v.severity === 'medium') {
                    medium++;
                    score += 20;
                } else if (v.severity === 'low') {
                    low++;
                    score += 5;
                }
            });

            const riskScore = Math.min(score, 100);

            const summary = {
                riskScore,
                critical,
                medium,
                low
            };

            const auditData = {
                name, address, network,
                code: sourceCode,
                summary,
                findings: combinedFindings,
                created_at: new Date().toISOString()
            };

            // Save to DB
            const { error } = await supabase
                .from('contract_audits')
                .insert([{
                    address, network, code_content: sourceCode,
                    result: auditData, risk_score: riskScore
                }]);

            if (error) console.error("DB Save failed", error);

            return { success: true, audit: auditData };

        } catch (error) {
            console.error("Audit Service Failed:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};
