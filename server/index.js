import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import { indexer } from './indexer.js';
import { supabase } from './supabaseClient.js';
import { AUDIT_SYSTEM_PROMPT } from './auditPrompt.js';

const app = express();
const PORT = 3001;

// AI Integration via Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'noclavetodavia' });
const AI_MODEL = "llama-3.3-70b-versatile";

const generateWithGroq = async (userContent, systemContent) => {
    // If systemContent is provided, use it as system message and userContent as user message.
    // Otherwise, treat userContent as the system message (legacy behavior for existing endpoints).
    const messages = systemContent
        ? [
            { role: "system", content: systemContent },
            { role: "user", content: userContent }
        ]
        : [{ role: "system", content: userContent }];

    const completion = await groq.chat.completions.create({
        messages,
        model: AI_MODEL,
        temperature: 0.1, // Low temperature for deterministic results
        response_format: { type: "json_object" } // Force JSON
    });
    return completion.choices[0]?.message?.content || "";
};

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
    const { address, network, code: manualCode, prompt } = req.body;
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GROQ_API_KEY" });
        }

        console.log(`[Audit] Starting analysis for ${address || 'Manual Code'} on ${network || 'Unknown'}`);

        // Use the prompt from the client which presumably contains the code and strict instructions
        // OR fallback to constructing it here if not provided (safety net)
        let finalPrompt = prompt;
        // If the prompt is missing but we have code, construct a prompt
        if (!finalPrompt && manualCode) {
            finalPrompt = `Contract Code:\n${manualCode}`;
        }

        if (!finalPrompt) {
            return res.status(400).json({ success: false, error: "Missing audit prompt or code" });
        }

        // Use the DEFINITIVE AUDIT PROMPT as the system instruction
        // and the client's prompt (or code) as the user message.
        // We append a JSON instruction just in case, though relying on response_format is better.
        const text = await generateWithGroq(finalPrompt, AUDIT_SYSTEM_PROMPT);

        // Robust JSON extraction
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("AI Response invalid:", text);
            throw new Error("AI did not return valid JSON");
        }

        const auditData = JSON.parse(jsonMatch[0]);

        // Map AI response to frontend expected format if keys differ
        const summary = auditData.summary || auditData.Summary || {};
        const findings = auditData.findings || auditData.Findings || [];

        // Check for "Security Score" in summary or root
        const riskScore = summary.riskScore || summary["Security Score"] || auditData["Security Score"] || 0;

        const auditResult = {
            success: true,
            audit: {
                name: address ? `Audit ${address.slice(0, 8)}` : 'Manual Audit',
                address,
                network,
                code: manualCode, // Send back what was audited
                riskScore: riskScore,
                summary: summary,
                vulnerabilities: findings.map(f => ({
                    ...f,
                    // Ensure compatibility with frontend expected fields
                    severity: (f.Severity || f.severity || "INFO").toUpperCase(),
                    explanation: f.Description || f.description || f.Title,
                    title: f.Title || f.title
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
                    risk_score: riskScore,
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

// Resume previous scans
const state = indexer.getStatus();
Object.keys(state.activeScans).forEach(network => {
    if (state.activeScans[network]) {
        indexer.startScanning(network);
    }
});

app.post('/api/generate-exploit', async (req, res) => {
    const { prompt } = req.body;
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ success: false, error: "Server missing GROQ_API_KEY" });
        }

        console.log("Generating exploit with Groq...");
        // Legacy: pass prompt as single argument (becomes system or user depending on helper logic)
        // Here we used to pass it as system prompt.
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
