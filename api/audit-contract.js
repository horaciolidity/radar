import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ugrgjgigyfuziqntxaqm.supabase.co',
    process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncmdqZ2lneWZ1emlxbnR4YXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDU4MzEsImV4cCI6MjA4NTc4MTgzMX0.s_A1txvtdPiKO4JwHAbJSlePjSERy_Oh8C5IDgl2Was'
);

const SYSTEM_ROLE = `You are a professional smart contract security auditor.

TASK:
Analyze the provided Solidity smart contract.

REQUIREMENTS:
- Analyze all logic, including inherited behavior.
- Identify vulnerabilities, risks, and dangerous functions.
- Classify severity: critical, medium, low.
- Assign UI color: red, yellow, green.
- Indicate if the issue is suitable for active exploit testing.

OUTPUT STRICTLY JSON.

FORMAT:
{
  "summary": {
    "riskScore": 0-100,
    "critical": number,
    "medium": number,
    "low": number
  },
  "findings": [
    {
      "id": "SC-001", // Auto-increment
      "severity": "critical|medium|low",
      "color": "red|yellow|green",
      "title": "",
      "description": "",
      "functions": [],
      "lines": [start, end],
      "exploitTestable": true|false,
      "justification": ""
    }
  ]
}`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { address, network, code: manualCode } = req.body;

    try {
        let sourceCode = manualCode;
        let name = 'Pasted Code';

        if (address && network) {
            // Fetch from explorer (Mocking for now)
            sourceCode = await fetchSourceCode(address, network);
            name = `Audit for ${address.slice(0, 10)}...`;
        }

        if (!sourceCode) {
            throw new Error("No source code found or provided");
        }

        // 1. Static Analysis (Deterministic)
        const staticAnalysis = analyzeSecurity(sourceCode);

        // 2. AI Analysis (Simulated or Real)
        const aiAnalysis = await performAIReview(sourceCode);

        // Merge results
        const combinedFindings = [
            ...staticAnalysis.findings,
            ...aiAnalysis.findings,
        ];

        // Recalculate summary based on combined findings
        const summary = calculateSummary(combinedFindings);

        const auditData = {
            name,
            address,
            network,
            code: sourceCode,
            summary: summary,
            findings: combinedFindings,
            created_at: new Date().toISOString()
        };

        // Save to Supabase
        const { error } = await supabase
            .from('contract_audits')
            .insert([
                {
                    address,
                    network,
                    code_content: sourceCode,
                    result: auditData, // Store the full JSON structure
                    risk_score: summary.riskScore
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
    const findings = [];
    let idCounter = 1;

    // Reentrancy check
    if (code.includes('.call{value:')) {
        findings.push({
            id: `SC-00${idCounter++}`,
            severity: 'critical',
            color: 'red',
            title: 'Potential Reentrancy',
            description: 'The contract uses call{value: ...} for transfers without a reentrancy guard or updating state before the external call.',
            functions: ['withdraw'],
            lines: [20, 22], // In a real parser we'd find exact lines
            exploitTestable: true,
            justification: 'External calls before state updates allow recursive calls.'
        });
    }

    // Centralization check
    if (code.includes('require(msg.sender == owner)')) {
        findings.push({
            id: `SC-00${idCounter++}`,
            severity: 'medium',
            color: 'yellow',
            title: 'Centralization Risk',
            description: 'Critical functions like minting are restricted to a single owner address.',
            functions: ['mint'],
            lines: [28, 31],
            exploitTestable: false,
            justification: 'Owner compromise leads to total protocol failure.'
        });
    }

    // Selfdestruct check
    if (code.includes('selfdestruct')) {
        findings.push({
            id: `SC-00${idCounter++}`,
            severity: 'medium',
            color: 'yellow',
            title: 'Unsafe Selfdestruct',
            description: 'Contract contains selfdestruct instruction which can permanently destroy the contract code.',
            functions: ['kill'],
            lines: [33, 35],
            exploitTestable: true,
            justification: 'Irreversible destruction of the contract.'
        });
    }

    return { findings };
}

async function performAIReview(code) {
    // START_AI_INTEGRATION
    // If you have an OpenAI key, you would uncomment this block:
    /*
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4",
                    messages: [
                        { role: "system", content: SYSTEM_ROLE },
                        { role: "user", content: code }
                    ],
                    temperature: 0.2
                })
            });
            const data = await response.json();
            const content = data.choices[0].message.content;
            // Parse JSON from content (handle potential markdown blocks)
            const cleanJson = content.replace(/```json/g, '').replace(/```/g, '');
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error("AI Request failed", e);
        }
    }
    */
    // END_AI_INTEGRATION

    // Mock AI Response matching the requested Schema
    return {
        summary: {
            riskScore: 65,
            critical: 0,
            medium: 1,
            low: 0
        },
        findings: [
            {
                id: 'AI-001',
                severity: 'medium',
                color: 'yellow',
                title: 'Logic Flaw: Unchecked Math',
                description: 'Potential overflow if solidity version < 0.8.0, though pragma is 0.8.0. Just a warning.',
                functions: ['deposit'],
                lines: [12, 12],
                exploitTestable: false,
                justification: 'Arithmetic operations should be verified.'
            }
        ]
    };
}

function calculateSummary(findings) {
    let critical = 0;
    let medium = 0;
    let low = 0;
    let score = 0;

    findings.forEach(f => {
        if (f.severity === 'critical') {
            critical++;
            score += 40;
        } else if (f.severity === 'medium') {
            medium++;
            score += 20;
        } else if (f.severity === 'low') {
            low++;
            score += 5;
        }
    });

    const riskScore = Math.min(score, 100);

    return {
        riskScore,
        critical,
        medium,
        low
    };
}
