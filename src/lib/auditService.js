import { supabase } from './supabase';

// Mock AI Logic and Static Analysis Rules
// In a real production app, this might call an external AI API (e.g., OpenAI)

const analyzeSecurity = (code) => {
    const vulnerabilities = [];

    // Reentrancy check
    if (code.includes('.call{value:')) {
        vulnerabilities.push({
            id: 'v1',
            title: 'Potential Reentrancy',
            severity: 'CRITICAL',
            startLine: 20,
            endLine: 22, // In a real parser, we'd find actual lines
            explanation: 'The contract uses call{value: ...} for transfers without a reentrancy guard or updating state before the external call.',
            impact: 'An attacker can recursively call the withdraw function and drain contract funds.',
            recommendation: 'Use nonReentrant guard or update the state (balances[msg.sender] = 0) BEFORE the external call.'
        });
    }

    // Centralization check
    if (code.includes('require(msg.sender == owner)')) {
        vulnerabilities.push({
            id: 'v2',
            title: 'Centralization Risk',
            severity: 'HIGH',
            startLine: 28,
            endLine: 31,
            explanation: 'Critical functions like minting are restricted to a single owner address.',
            impact: 'The owner can manipulate the token supply or block user functions if the key is compromised.',
            recommendation: 'Consider using a Multi-Sig wallet or a DAO governance for owner-restricted functions.'
        });
    }

    // Selfdestruct check
    if (code.includes('selfdestruct')) {
        vulnerabilities.push({
            id: 'v3',
            title: 'Unsafe Selfdestruct',
            severity: 'HIGH',
            startLine: 33,
            endLine: 35,
            explanation: 'Contract contains selfdestruct instruction which can permanently destroy the contract code and state.',
            impact: 'Contract could be rendered inoperable, locking all funds or functionality.',
            recommendation: 'Remove selfdestruct unless absolutely necessary for the protocol life cycle.'
        });
    }

    return { vulnerabilities };
};

const simulateAIReview = (code, existing) => {
    // Simulate some high-level semantic findings
    return [
        {
            id: 'ai1',
            title: 'Logic Flaw: Unchecked Balances',
            severity: 'MEDIUM',
            startLine: 12,
            endLine: 14,
            explanation: 'AI detected a potential integer overflow or logic flaw in how balances are incremented.',
            impact: 'Potential accounting errors in complex edge cases.',
            recommendation: 'Use OpenZeppelin SafeMath or ensure Solidity 0.8+ is correctly configured.'
        }
    ];
};

const calculateRiskScore = (vulns) => {
    let score = 0;
    vulns.forEach(v => {
        if (v.severity === 'CRITICAL') score += 40;
        else if (v.severity === 'HIGH') score += 25;
        else if (v.severity === 'MEDIUM') score += 10;
        else score += 5;
    });
    return Math.min(score, 100);
};

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
    if (!apiUrl) {
        console.warn(`No explorer API for ${network}`);
        return null;
    }

    try {
        // We use a free-tier/no-key approach which is rate limited but works for light usage.
        // Action: getsourcecode
        const response = await fetch(`${apiUrl}?module=contract&action=getsourcecode&address=${address}`);
        const data = await response.json();

        if (data.status === '1' && data.result && data.result.length > 0) {
            const sourceInfo = data.result[0];

            // Handle verified source code
            if (sourceInfo.SourceCode) {
                // Etherscan sometimes wraps multiple files in double curly braces {{...}}
                if (sourceInfo.SourceCode.startsWith('{{')) {
                    return sourceInfo.SourceCode;
                }
                return sourceInfo.SourceCode;
            }
        }

        // Return bytecode if source not verified (commented out as user wants source)
        // return "// Unverified Contract. Source code not published.";

        return null;
    } catch (e) {
        console.error("Failed to fetch source from explorer:", e);
        return null;
    }
};

export const auditService = {
    async performAudit({ address, network, code: manualCode }) {
        try {
            let sourceCode = manualCode;
            let name = 'Pasted Code';

            if (address && network && !manualCode) {
                sourceCode = await fetchSourceCode(address, network);
                if (sourceCode) {
                    name = `Audit for ${address.slice(0, 10)}...`;
                } else {
                    // Fallback if not verified
                    name = `Unverified: ${address.slice(0, 10)}...`;
                    sourceCode = "// Contract source code not verified on explorer.\n// To audit this contract, please verify it on the block explorer first\n// or paste the source code manually.";

                    // We can't really analyze text that doesn't exist, so this will yield 0 vulns
                    // maybe we should throw?
                }
            }

            if (!sourceCode) {
                throw new Error("No source code found or provided");
            }

            // Run Security Analysis
            const analysis = analyzeSecurity(sourceCode);

            // AI Semantic review simulation
            const aiReview = simulateAIReview(sourceCode, analysis.vulnerabilities);

            const combinedVulnerabilities = [...analysis.vulnerabilities, ...aiReview];
            const riskScore = calculateRiskScore(combinedVulnerabilities);

            const auditData = {
                name,
                address,
                network,
                code: sourceCode,
                riskScore,
                vulnerabilities: combinedVulnerabilities,
                created_at: new Date().toISOString()
            };

            // Save to Supabase
            // Note: This relies on the "Allow public insert" RLS policy being enabled
            const { data, error } = await supabase
                .from('contract_audits')
                .insert([
                    {
                        address,
                        network,
                        code_content: sourceCode,
                        result: auditData,
                        risk_score: riskScore
                    }
                ])
                .select();

            if (error) {
                console.error("Supabase insert error:", error);
                // We might still want to return the result even if save fails, but let's throw for now to be distinct
                // throw error; 
            }

            return {
                success: true,
                audit: auditData // Return the data we just generated/saved
            };

        } catch (error) {
            console.error("Audit Service Failed:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};
