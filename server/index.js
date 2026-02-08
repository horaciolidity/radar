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
// Audit Contract logic
app.post('/api/audit-contract', async (req, res) => {
    const { address, network, code: manualCode, prompt } = req.body;
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GROQ_API_KEY" });
        }

        console.log(`[Audit] Starting analysis for ${address || 'Manual Code'} on ${network || 'Unknown'}`);

        // Use the prompt from the client which presumably contains the code and strict instructions
        // OR fallback to constructing it here if not provided (safety net)
        let finalPrompt = prompt;
        if (!finalPrompt) {
            return res.status(400).json({ success: false, error: "Missing audit prompt" });
        }

        const text = await generateWithGroq(finalPrompt);

        // Robust JSON extraction
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("AI Response invalid:", text);
            throw new Error("AI did not return valid JSON");
        }

        const auditData = JSON.parse(jsonMatch[0]);

        // Validate structure briefly
        if (!auditData.summary || !auditData.findings) {
            throw new Error("AI response missing required 'summary' or 'findings' fields");
        }

        const auditResult = {
            success: true,
            audit: {
                name: address ? `Audit ${address.slice(0, 8)}` : 'Manual Audit',
                address,
                network,
                code: manualCode, // Send back what was audited
                riskScore: auditData.summary.riskScore,
                summary: auditData.summary,
                vulnerabilities: auditData.findings.map(f => ({
                    ...f,
                    // Ensure compatibility with frontend expected fields if needed
                    severity: f.severity.toUpperCase(),
                    explanation: f.description
                }))
            }
        };

        // Save to Supabase (optional for local)
        try {
            if (address && network) {
                await supabase.from('contract_audits').insert([{
                    address,
                    network,
                    result: auditResult.audit,
                    risk_score: auditData.summary.riskScore,
                    code_content: manualCode
                }]);
            }
        } catch (dbError) {
            console.warn("Failed to save audit to DB:", dbError.message);
        }

        res.json(auditResult);
    } catch (e) {
        console.error("Audit Error:", e);
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

import Groq from 'groq-sdk';

// Resume previous scans
const state = indexer.getStatus();
Object.keys(state.activeScans).forEach(network => {
    if (state.activeScans[network]) {
        indexer.startScanning(network);
    }
});

// AI Integration via Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'noclavetodavia' });
const AI_MODEL = "llama-3.3-70b-versatile";

const generateWithGroq = async (prompt) => {
    const completion = await groq.chat.completions.create({
        messages: [{ role: "system", content: prompt }], // Sending strict prompt as system/user message
        model: AI_MODEL,
        temperature: 0.1, // Low temperature for deterministic results
        response_format: { type: "json_object" } // Force JSON
    });
    return completion.choices[0]?.message?.content || "";
};

app.post('/api/generate-exploit', async (req, res) => {
    const { prompt } = req.body;
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GROQ_API_KEY" });
        }

        console.log("Generating exploit with Groq...");
        const text = await generateWithGroq(prompt);

        // Extract JSON from potential markdown blocks (though json_object mode should help)
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
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GROQ_API_KEY" });
        }

        console.log("Verifying exploit with Groq...");
        const text = await generateWithGroq(prompt);

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
