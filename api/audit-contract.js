import { createClient } from '@supabase/supabase-js';

export const config = {
    runtime: 'edge',
};

// HELPER: Extract JSON from AI text
function extractJSON(text) {
    try {
        console.log("Extracting JSON from text length:", text.length);
        const cleanText = text.replace(/```json\n?|```/g, '').trim();
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("No JSON braces found in text:", text.slice(0, 500));
            return null;
        }
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("JSON Extraction failed:", e.message, "Text snippet:", text.slice(0, 200));
        return null;
    }
}

export default async function handler(req) {
    const VERSION = "v6.0-enterprise-auditor-deepseek-debug";
    console.log(`[${VERSION}] Handler started...`);

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const body = await req.json();
        const { address, network, code, prompt } = body;

        console.log(`[${VERSION}] Received request for address: ${address || 'manual'}, network: ${network}`);
        console.log(`[${VERSION}] Prompt length: ${prompt?.length || 0}`);

        if (!process.env.DEEPSEEK_API_KEY) {
            console.error(`[${VERSION}] CRITICAL: DEEPSEEK_API_KEY is missing!`);
            return new Response(JSON.stringify({
                success: false,
                error: "Detección: DEEPSEEK_API_KEY no encontrada en Vercel."
            }), {
                status: 500, headers: { 'Content-Type': 'application/json' }
            });
        }

        // 1. PERFORM AI AUDIT USING DEEPSEEK
        let auditResult = null;
        let lastError = null;

        try {
            const apiEndpoint = 'https://api.deepseek.com/chat/completions';
            console.log(`[${VERSION}] Fetching DeepSeek at ${apiEndpoint}...`);

            const dsRes = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        {
                            role: "system",
                            content: "Actúa EXCLUSIVAMENTE como un Auditor de Seguridad Smart Contracts senior (OpenZeppelin, Trail of Bits, Spearbit). Output VALID JSON ONLY siguiendo las fases de auditoría proporcionadas."
                        },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 4000
                })
            });

            console.log(`[${VERSION}] DeepSeek response status: ${dsRes.status}`);

            if (dsRes.ok) {
                const data = await dsRes.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) {
                    lastError = "DeepSeek returned empty content.";
                    console.error(`[${VERSION}] ${lastError}`, JSON.stringify(data));
                } else {
                    auditResult = extractJSON(content);
                    if (!auditResult) {
                        lastError = "Failed to parse JSON from DeepSeek response.";
                    }
                }
            } else {
                const errorText = await dsRes.text();
                lastError = `DeepSeek API Error (HTTP ${dsRes.status}): ${errorText}`;
                console.error(`[${VERSION}] ${lastError}`);
            }
        } catch (e) {
            lastError = `DeepSeek Fetch Exception: ${e.message}`;
            console.error(`[${VERSION}] ${lastError}`);
        }

        if (!auditResult) {
            return new Response(JSON.stringify({
                success: false,
                error: lastError || "Unknown error during DeepSeek analysis."
            }), {
                status: 500, headers: { 'Content-Type': 'application/json' }
            });
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
                console.log(`[${VERSION}] Initializing Supabase...`);
                const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
                await supabase
                    .from('contract_audits')
                    .insert([{
                        address: address || 'manual',
                        network: network || 'unknown',
                        code_content: code || 'manual_paste',
                        result: auditData,
                        risk_score: auditData.summary?.riskScore || 0
                    }]);
                console.log(`[${VERSION}] Saved to Supabase.`);
            } catch (e) {
                console.warn(`[${VERSION}] Supabase save failed:`, e.message);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            audit: auditData
        }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error(`[${VERSION}] FATAL ERROR:`, e.message);
        return new Response(JSON.stringify({ success: false, error: `Fatal Handler Error: ${e.message}` }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
