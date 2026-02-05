import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ugrgjgigyfuziqntxaqm.supabase.co',
    process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncmdqZ2lneWZ1emlxbnR4YXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDU4MzEsImV4cCI6MjA4NTc4MTgzMX0.s_A1txvtdPiKO4JwHAbJSlePjSERy_Oh8C5IDgl2Was'
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { address, network, code: manualCode } = req.body;

    try {
        let sourceCode = manualCode;
        let name = 'Pasted Code';

        if (address && network) {
            // Fetch from explorer (Mocking for now, as we don't have API keys for every explorer)
            // In production, we would use: https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}
            sourceCode = await fetchSourceCode(address, network);
            name = `Audit for ${address.slice(0, 10)}...`;
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

        if (error) console.error("Supabase error:", error);

        return res.status(200).json({
            success: true,
            audit: auditData
        });

    } catch (error) {
        console.error("Audit failed:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

async function fetchSourceCode(address, network) {
    // Mocking fetch logic
    // In a real app, this would use fetch() to explorer APIs
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableToken {
    mapping(address => uint256) public balances;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0);
        
        (bool success, ) = msg.sender.call{value: amount}(""); // REENTRANCY VULNERABILITY
        require(success);
        
        balances[msg.sender] = 0;
    }

    function mint(address to, uint256 amount) public {
        require(msg.sender == owner); // CENTRALIZATION
        balances[to] += amount;
    }
    
    function kill() public {
        selfdestruct(payable(owner)); // RISK
    }
}`;
}

function analyzeSecurity(code) {
    const vulnerabilities = [];

    // Reentrancy check
    if (code.includes('.call{value:')) {
        vulnerabilities.push({
            id: 'v1',
            title: 'Potential Reentrancy',
            severity: 'CRITICAL',
            startLine: 20,
            endLine: 22,
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
}

function simulateAIReview(code, existing) {
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
}

function calculateRiskScore(vulns) {
    let score = 0;
    vulns.forEach(v => {
        if (v.severity === 'CRITICAL') score += 40;
        else if (v.severity === 'HIGH') score += 25;
        else if (v.severity === 'MEDIUM') score += 10;
        else score += 5;
    });
    return Math.min(score, 100);
}
