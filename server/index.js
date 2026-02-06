import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { indexer } from './indexer.js';
import { supabase } from './supabaseClient.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Get system status
app.get('/api/status', (req, res) => {
    res.json(indexer.getStatus());
});

// Start scanning a specific network
app.post('/api/scan/start', async (req, res) => {
    const { network } = req.body;
    if (!network) return res.status(400).json({ error: "Network required" });
    await indexer.startScanning(network);
    res.json({ success: true, network, isScanning: true });
});

// Stop scanning a specific network
app.post('/api/scan/stop', (req, res) => {
    const { network } = req.body;
    if (!network) return res.status(400).json({ error: "Network required" });
    indexer.stopScanning(network);
    res.json({ success: true, network, isScanning: false });
});

// Historical search
app.post('/api/scan/history', async (req, res) => {
    const { network, blocks } = req.body;
    if (!network) return res.status(400).json({ error: "Network required" });
    indexer.scanHistory(network, blocks || 10); // Default 10 blocks
    res.json({ success: true, message: "Historical scan started in background" });
});

// Audit Contract logic
app.post('/api/audit-contract', async (req, res) => {
    const { address, network, code: manualCode } = req.body;
    try {
        // Simple analysis implementation for the local server
        let sourceCode = manualCode;
        if (address && network) {
            // Simulated fetch
            sourceCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LocalCheck {
    mapping(address => uint) public balances;
    function withdraw() public {
        (bool s,) = msg.sender.call{value: balances[msg.sender]}("");
        require(s);
        balances[msg.sender] = 0;
    }
}`;
        }

        const vulnerabilities = [];
        if (sourceCode.includes('.call{value:')) {
            vulnerabilities.push({
                id: 'v1',
                title: 'Potential Reentrancy',
                severity: 'CRITICAL',
                startLine: 7,
                endLine: 9,
                explanation: 'State update happens after external call.',
                impact: 'Funds drainage.',
                recommendation: 'Use Checks-Effects-Interactions pattern.'
            });
        }

        const auditResult = {
            success: true,
            audit: {
                name: address ? `Audit ${address.slice(0, 8)}` : 'Manual Audit',
                address,
                network,
                code: sourceCode,
                riskScore: vulnerabilities.length > 0 ? 85 : 0,
                vulnerabilities
            }
        };

        // Save to Supabase (optional for local)
        await supabase.from('contract_audits').insert([{
            address, network, result: auditResult.audit, risk_score: auditResult.audit.riskScore, code_content: sourceCode
        }]);

        res.json(auditResult);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get contracts with filters
app.get('/api/contracts', async (req, res) => {
    try {
        const { network, risk } = req.query;
        let query = supabase
            .from('contracts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(100);

        if (network && network !== 'all') {
            query = query.eq('network', network);
        }

        if (risk && risk !== 'all') {
            query = query.eq('tag', risk.toUpperCase());
        }

        const { data, error } = await query;

        if (error) throw error;

        // Map back to internal format for frontend consistency
        const results = data.map(indexer.mapDbToInternal);
        res.json(results);
    } catch (e) {
        console.error("API error:", e.message);
        res.status(500).json({ error: "Failed to fetch contracts" });
    }
});

import { GoogleGenerativeAI } from '@google/generative-ai';

// Resume previous scans
const state = indexer.getStatus();
Object.keys(state.activeScans).forEach(network => {
    if (state.activeScans[network]) {
        indexer.startScanning(network);
    }
});

// AI Integration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'noclavetodavia');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.post('/api/generate-exploit', async (req, res) => {
    const { prompt } = req.body;
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GEMINI_API_KEY" });
        }

        console.log("Generating exploit with Gemini...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Extract JSON from potential markdown blocks
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in AI response");

        const json = JSON.parse(jsonMatch[0]);
        res.json({ success: true, exploit: json });
    } catch (e) {
        console.error("AI Generation Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/verify-exploit', async (req, res) => {
    const { prompt } = req.body;
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GEMINI_API_KEY" });
        }

        console.log("Verifying exploit with Gemini...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in AI response");

        const json = JSON.parse(jsonMatch[0]);
        res.json(json);
    } catch (e) {
        console.error("AI Verification Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
