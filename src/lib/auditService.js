import { supabase } from './supabase';
import { contractManager } from './contractManager'; // Helper to get providers

// ==========================================
// 1. ADVANCED SECURITY RULES (SOURCE CODE)
// ==========================================
const analyzeSecurity = (code) => {
    const vulnerabilities = [];
    // Normalize code for easier matching (remove excessive whitespace)
    const normalizedCode = code.replace(/\r/g, '').split('\n');

    const addVuln = (id, title, severity, lineIdx, explanation, impact, rec) => {
        vulnerabilities.push({
            id, title, severity,
            startLine: lineIdx + 1,
            endLine: lineIdx + 1,
            explanation, impact, recommendation: rec
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
            addVuln('v-honey-1', 'Potential Honeypot Logic', 'CRITICAL', i,
                'Transfer appears conditionally restricted based on custom flags (tradingOpen, isBot, etc).',
                'Users might be unable to sell if the owner disables trading or blacklists them.',
                'Verify these restrictions cannot be abused to lock funds.');
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
                addVuln('v-fake-mint', 'Non-Standard Balance Update', 'HIGH', i,
                    'Balances are being modified in a non-standard way.',
                    'Risk of hidden minting or balance spoofing.',
                    'Ensure strictly standard ERC20 transfer logic.');
            }
        }

        // -----------------------------
        // B. DANGEROUS PERMISSIONS
        // -----------------------------

        // 3. Blacklist Capabilities
        if (lowerContent.includes('blacklist') || lowerContent.includes('bot') || lowerContent.includes('antisniper')) {
            if (lowerContent.includes('mapping')) {
                addVuln('v-blacklist', 'Blacklist Mechanism', 'HIGH', i,
                    'Contract contains a blacklist/bot mapping.',
                    'Owner can arbitrarily block addresses from trading.',
                    'Centralized control over user assets.');
            }
        }

        // 4. Fee Manipulation (High Tax)
        if ((lowerContent.includes('setfee') || lowerContent.includes('settax') || lowerContent.includes('updatefees')) && lowerContent.includes('function')) {
            addVuln('v-fees', 'Mutable Feerate', 'MEDIUM', i,
                'Owner can change the tax/fee rate.',
                'Owner could set fees to 100% (Honeypot).',
                'Ensure there is a hard cap (e.g. max 25%) in the code.');
        }

        // 5. Max Transaction / Wallet Limits
        if ((lowerContent.includes('maxtextamount') || lowerContent.includes('maxwallet') || lowerContent.includes('_maxtxamount')) && (lowerContent.includes('set') || lowerContent.includes('update'))) {
            addVuln('v-limits', 'Mutable Transaction Limits', 'MEDIUM', i,
                'Owner can change max transaction or wallet limits.',
                'Can be used to effectively stop trading (set limit to 0).',
                'Check for lower bounds (MIN keys).');
        }

        // -----------------------------
        // C. TECHNICAL VULNERABILITIES
        // -----------------------------

        // 6. Reentrancy
        if (content.includes('.call{value:') && !lowerContent.includes('nonreentrant')) {
            addVuln('v-reent', 'Potential Reentrancy', 'CRITICAL', i,
                'Low-level call used to transfer ETH without reentrancy guard.',
                'Attackers can drain funds by recursively calling.',
                'Use ReentrancyGuard/nonReentrant.');
        }

        // 7. Delegatecall
        if (content.includes('delegatecall')) {
            addVuln('v-delegate', 'Unsafe Delegatecall', 'CRITICAL', i,
                'Contract executes code from another address.',
                'If target is malicious, contract can be destroyed.',
                'Verify target trust.');
        }

        // 8. Self Destruct
        if (content.includes('selfdestruct')) {
            addVuln('v-destruct', 'Self Destruct', 'HIGH', i,
                'Can verify destroy contract.',
                'Rug pull risk.',
                'Remove unless necessary.');
        }

        // 9. Weak Randomness
        if ((content.includes('block.difficulty') || content.includes('block.timestamp')) && (content.includes('%'))) {
            addVuln('v-random', 'Weak Randomness', 'LOW', i,
                'Using block attributes for RNG.',
                'Miners can manipulate result.',
                'Use Chainlink VRF.');
        }

        // 10. Tx.Origin
        if (content.includes('tx.origin')) {
            addVuln('v-txorigin', 'Tx.Origin Phishing', 'MEDIUM', i,
                'Authorization using tx.origin.',
                'Phishing risk.',
                'Use msg.sender.');
        }
    });

    return { vulnerabilities };
};

// ==========================================
// 2. BYTECODE ANALYSIS (UNVERIFIED CONTRACTS)
// ==========================================
const analyzeBytecode = (bytecode) => {
    const vulns = [];

    // Check for SELFDESTRUCT opcode (0xff)
    if (bytecode.includes('ff')) { // Simplified check, strictly need full disassembly but heuristic works often
        vulns.push({
            id: 'b-destruct', title: 'Self-Destruct Opcode Detected', severity: 'HIGH',
            startLine: 1, endLine: 1,
            explanation: 'The compiled bytecode contains the SELFDESTRUCT opcode (0xFF).',
            impact: 'Contract can be destroyed.', recommendation: 'Verify source code to confirm safety.'
        });
    }

    // Check for DELEGATECALL (0xf4)
    if (bytecode.includes('f4')) {
        vulns.push({
            id: 'b-delegate', title: 'Delegatecall Opcode Detected', severity: 'MEDIUM',
            startLine: 1, endLine: 1,
            explanation: 'The compiled bytecode contains DELEGATECALL (0xF4).',
            impact: 'Contract relies on external logic.', recommendation: 'Verify source to ensure delegate target is safe.'
        });
    }

    return vulns;
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
    'Optimism': 'https://api-optimistic.etherscan.io/api'
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
export const auditService = {
    async performAudit({ address, network, code: manualCode }) {
        try {
            let sourceCode = manualCode;
            let name = 'Audit Report';
            let isUnverified = false;
            let combinedVulnerabilities = [];

            // Case 1: Manual Code Paste
            if (!address && manualCode) {
                name = 'Manual Analysis';
                const analysis = analyzeSecurity(manualCode);
                combinedVulnerabilities = analysis.vulnerabilities;
            }

            // Case 2: Address Search
            else if (address && network) {
                // A. Try to fetch Source Code
                sourceCode = await fetchSourceCode(address, network);

                if (sourceCode) {
                    name = `Audit: ${address.slice(0, 8)}... (${network})`;
                    const analysis = analyzeSecurity(sourceCode);
                    combinedVulnerabilities = analysis.vulnerabilities;
                } else {
                    // B. Fallback to Bytecode Analysis (Unverified)
                    isUnverified = true;
                    name = `UNVERIFIED: ${address.slice(0, 8)}...`;

                    try {
                        const provider = contractManager.getProvider(network);
                        if (provider) {
                            sourceCode = await provider.getCode(address);
                            if (sourceCode === '0x') throw new Error("Contract does not exist");

                            // Analyze Bytecode
                            combinedVulnerabilities = analyzeBytecode(sourceCode);

                            // Prepare display for the viewer
                            sourceCode = `// ⚠️ CONTRACT SOURCE CODE NOT VERIFIED\n// ⚠️ DISPLAYING RAW BYTECODE ANALYSIS\n\n// Address: ${address}\n// Network: ${network}\n\n` +
                                `// Analysis Findings:\n` +
                                (combinedVulnerabilities.length > 0 ? combinedVulnerabilities.map(v => `// - [${v.severity}] ${v.title}`).join('\n') : '// - No obvious bytecode hazards found (ff/f4)') +
                                `\n\n// Raw Bytecode:\n` + sourceCode;
                        } else {
                            throw new Error("Could not connect to network provider");
                        }
                    } catch (err) {
                        throw new Error(`Analysis failed: ${err.message}`);
                    }
                }
            }

            // Calculate Score
            let riskScore = 0;
            combinedVulnerabilities.forEach(v => {
                if (v.severity === 'CRITICAL') riskScore += 40;
                else if (v.severity === 'HIGH') riskScore += 25;
                else if (v.severity === 'MEDIUM') riskScore += 10;
                else riskScore += 2;
            });
            riskScore = Math.min(riskScore, 100);

            const auditData = {
                name, address, network,
                code: sourceCode,
                riskScore,
                vulnerabilities: combinedVulnerabilities,
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
