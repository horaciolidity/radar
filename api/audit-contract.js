import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || ''
);

export const config = {
    runtime: 'edge',
};

// HELPER: Extract JSON from AI text
function extractJSON(text) {
    try {
        // Remove potential markdown wrappers
        const cleanText = text.replace(/```json\n?|```/g, '').trim();
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("JSON Extraction failed:", e.message, "Text snippet:", text.slice(0, 100));
        return null;
    }
}

export default async function handler(req) {
    const VERSION = "v4.1-enterprise-auditor";

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { address, network, code, prompt } = await req.json();

        // 1. PERFORM AI AUDIT
        let auditResult = null;

        // Try GROQ
        if (process.env.GROQ_API_KEY) {
            try {
                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            { role: "system", content: "You are an enterprise-grade smart contract auditor. Output JSON ONLY." },
                            { role: "user", content: prompt }
                        ],
                        response_format: { type: "json_object" }
                    })
                });

                if (groqRes.ok) {
                    const data = await groqRes.json();
                    auditResult = extractJSON(data.choices[0].message.content);
                }
            } catch (e) {
                console.warn(`[${VERSION}] Groq Error:`, e.message);
            }
        }

        // Fallback to Gemini
        if (!auditResult && process.env.GEMINI_API_KEY) {
            try {
                console.log(`[${VERSION}] Trying Gemini...`);
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const modelName = "gemini-1.5-flash"; // Stable model name
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                auditResult = extractJSON(text);
                if (!auditResult) {
                    console.warn(`[${VERSION}] Gemini returned text but no valid JSON found. Text:`, text.slice(0, 500));
                }
            } catch (e) {
                console.error(`[${VERSION}] Gemini Error:`, e.message);
                throw new Error(`Gemini API Error: ${e.message}`);
            }
        }

        if (!auditResult) {
            throw new Error("AI Analysis failed or returned invalid format");
        }

        // 2. PREPARE FINAL STRUCTURE
        const auditData = {
            name: address ? `Audit: ${address.slice(0, 10)}...` : "Manual Audit",
            address,
            network,
            code,
            summary: auditResult.summary,
            findings: auditResult.findings,
            created_at: new Date().toISOString()
        };

        // 3. OPTIONAL: Save to Supabase (if configured)
        if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
            try {
                await supabase
                    .from('contract_audits')
                    .insert([{
                        address,
                        network,
                        code_content: code,
                        result: auditData,
                        risk_score: auditData.summary.riskScore
                    }]);
            } catch (e) {
                console.warn("Supabase save failed", e.message);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            audit: auditData
        }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
