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
    const VERSION = "v4.2-enterprise-auditor-groq-only";

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { address, network, code, prompt } = await req.json();

        if (!process.env.GROQ_API_KEY) {
            return new Response(JSON.stringify({
                success: false,
                error: "GROQ_API_KEY is missing in environment variables."
            }), {
                status: 500, headers: { 'Content-Type': 'application/json' }
            });
        }

        // 1. PERFORM AI AUDIT
        let auditResult = null;
        let lastError = null;

        try {
            console.log(`[${VERSION}] Trying Groq (llama-3.3-70b-versatile)...`);
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "system",
                            content: "Actúa EXCLUSIVAMENTE como un Auditor de Seguridad Smart Contracts senior (OpenZeppelin, Trail of Bits, Spearbit). La CONSISTENCIA y la VERACIDAD son prioritarias. No inventes vulnerabilidades. Output VALID JSON ONLY siguiendo las fases de auditoría proporcionadas."
                        },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                })
            });

            if (groqRes.ok) {
                const data = await groqRes.json();
                const content = data.choices[0].message.content;
                auditResult = extractJSON(content);
                if (!auditResult) {
                    lastError = "Groq returned success but content was not valid JSON or lacked the required fields.";
                    console.warn(`[${VERSION}] ${lastError}`, content.slice(0, 200));
                } else {
                    console.log(`[${VERSION}] Groq Analysis successful.`);
                }
            } else {
                const errMsg = await groqRes.text();
                lastError = `Groq API Error (Status ${groqRes.status}): ${errMsg}`;
                console.error(`[${VERSION}] ${lastError}`);
            }
        } catch (e) {
            lastError = `Groq Fetch Exception: ${e.message}`;
            console.error(`[${VERSION}] ${lastError}`);
        }

        if (!auditResult) {
            return new Response(JSON.stringify({
                success: false,
                error: lastError || "Unknown error during Groq analysis."
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
                await supabase
                    .from('contract_audits')
                    .insert([{
                        address,
                        network,
                        code_content: code,
                        result: auditData,
                        risk_score: auditData.summary?.riskScore || 0
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
        return new Response(JSON.stringify({ success: false, error: `Fatal Handler Error: ${e.message}` }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
