import { supabase } from './supabase';
import { contractManager } from './contractManager'; // Helper to get providers

// ==========================================
// 1. ADVANCED SECURITY RULES (SOURCE CODE)
// ==========================================
const analyzeSecurity = (code) => {
    const vulnerabilities = [];
    const lines = code.split('\n');

    const addVuln = (id, title, severity, lineIdx, explanation, impact, rec) => {
        vulnerabilities.push({
            id, title, severity,
            startLine: lineIdx + 1,
            endLine: lineIdx + 1,
            explanation, impact, recommendation: rec
        });
    };

    lines.forEach((line, i) => {
        const content = line.trim();
        if (content.startsWith('//') || content.startsWith('*')) return; // Skip comments

        // --- CRITICAL/HIGH RISKS ---

        // 1. Reentrancy (Basic)
        if (content.includes('.call{value:') && !content.includes('nonReentrant')) {
            addVuln('v-reent', 'Potential Reentrancy', 'CRITICAL', i,
                'Low-level call used to transfer ETH without visible reentrancy guard.',
                'Attackers can drain funds by recursively calling the function.',
                'Use ReentrancyGuard or Check-Effects-Interactions pattern.');
        }

        // 2. Delegatecall (Unsafe External Logic)
        if (content.includes('delegatecall')) {
            addVuln('v-delegate', 'Unsafe Delegatecall', 'CRITICAL', i,
                'Contract executes code from another address in its own context.',
                'If the target address is malicious or mutable, it can destroy this contract.',
                'Ensure the target is constant and trusted.');
        }

        // 3. Self Destruct
        if (content.includes('selfdestruct')) {
            addVuln('v-destruct', 'Self Destruct Capable', 'HIGH', i,
                'Contract can destroy itself and burn its ether/code.',
                'Users could lose all stuck funds or the protocol stops working.',
                'Avoid unless strictly necessary for upgrades.');
        }

        // 4. Tx.Origin (Phishing)
        if (content.includes('tx.origin')) {
            addVuln('v-txorigin', 'Tx.Origin Authentication', 'HIGH', i,
                'Using tx.origin for authorization is vulnerable to phishing.',
                'A malicious contract can trick an admin into authorizing a transaction.',
                'Use msg.sender instead.');
        }

        // --- MEDIUM RISKS ---

        // 5. Weak Randomness
        if ((content.includes('block.difficulty') || content.includes('block.timestamp') || content.includes('now')) && (content.includes('%') || content.includes('random'))) {
            addVuln('v-random', 'Weak Randomness', 'MEDIUM', i,
                'Using block attributes for randomness is predictable by miners.',
                'Miners can manipulate the block to game the result.',
                'Use Chainlink VRF or Commit-Reveal scheme.');
        }

        // 6. Unchecked Low Level Call
        if (content.includes('.call(') && !content.includes('require') && !content.includes('if') && !content.includes('success')) {
            addVuln('v-unchecked', 'Unchecked Low-Level Call', 'MEDIUM', i,
                'Return value of .call is not checked.',
                'If the call fails, execution continues silently, leading to inconsistent state.',
                'Always check the boolean return value: (bool success, ) = ...');
        }

        // 7. Centralization (Owner)
        if ((content.includes('onlyOwner') || content.includes('require(msg.sender == owner)')) && (content.includes('mint') || content.includes('withdraw'))) {
            addVuln('v-central', 'Centralized Privileges', 'MEDIUM', i,
                'Owner has direct control over critical functions (mint/withdraw).',
                'Risk of rug-pull if owner key is compromised.',
                'Use MultiSig or TimeLock.');
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
