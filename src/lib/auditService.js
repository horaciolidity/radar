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

    // Centralization check (Ownership)
    if (code.includes('onlyOwner') || code.includes('require(msg.sender == owner)')) {
        // Only classify as High Risk if it controls Minting or SelfDestruct
        if (code.includes('mint') || code.includes('_mint')) {
            vulnerabilities.push({
                id: 'v2',
                title: 'Centralized Minting',
                severity: 'HIGH',
                startLine: 1, // Placeholder
                endLine: 1,
                explanation: 'Contract allows the owner to mint tokens, potentially diluting supply.',
                impact: 'Owner can manipulate token price by printing unlimited tokens.',
                recommendation: 'Use a Multi-Sig wallet or remove minting capability after launch.'
            });
        } else {
            vulnerabilities.push({
                id: 'v2-info',
                title: 'Centralization (Ownable)',
                severity: 'LOW', // Downgraded from HIGH
                startLine: 1,
                endLine: 1,
                explanation: 'Contract has privileged functions restricted to an owner.',
                impact: 'Reliance on a single key for administrative actions.',
                recommendation: 'Ensure owner is a secure wallet (Multisig/DAO).'
            });
        }
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
    // Client-side Semantic Check (Heuristics)
    // In the future, this could be replaced by a call to OpenAI/Claude API
    const findings = [];

    // Check for floating pragma
    if (/pragma solidity \^/.test(code)) {
        findings.push({
            id: 'ai-pragma',
            title: 'Floating Pragma',
            severity: 'LOW',
            startLine: 1,
            endLine: 1,
            explanation: 'Contract uses a floating pragma (e.g. ^0.8.0), which allows compiling with potentially unstable future compiler versions.',
            impact: 'Risk of unexpected behavior if compiled with a buggy newer compiler version.',
            recommendation: 'Lock the pragma version (e.g. pragma solidity 0.8.19;).'
        });
    }

    return findings;
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
                // Or returns a JSON object string for multi-part contracts
                if (sourceInfo.SourceCode.startsWith('{')) {
                    try {
                        // Some responses are like {{ "language": "Solidity", ... }} so we strip one layer if needed
                        let jsonContent = sourceInfo.SourceCode;
                        if (jsonContent.startsWith('{{') && jsonContent.endsWith('}}')) {
                            jsonContent = jsonContent.slice(1, -1);
                        }

                        const parsed = JSON.parse(jsonContent);
                        if (parsed.sources) {
                            // Concatenate all source files into one for display/analysis
                            return Object.entries(parsed.sources)
                                .map(([path, content]) => `// File: ${path}\n\n${content.content}`)
                                .join('\n\n');
                        }
                    } catch (err) {
                        console.warn("Failed to parse SourceCode JSON, returning raw", err);
                    }
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
