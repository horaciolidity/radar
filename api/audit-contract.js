import { createClient } from '@supabase/supabase-js';

// NOTA: Hemos eliminado el runtime edge para mayor estabilidad con IA
export default async function handler(req, res) {
    const VERSION = "v7.0-enterprise-auditor-deepseek-node";
    console.log(`[${VERSION}] Request received`);

    // CORS y Method check
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { address, network, code, prompt } = req.body;

        console.log(`[${VERSION}] Auditing: ${address || 'Manual Code'}`);

        if (!process.env.DEEPSEEK_API_KEY) {
            console.error(`[${VERSION}] Error: DEEPSEEK_API_KEY missing`);
            return res.status(500).json({
                success: false,
                error: "Configuración incompleta: DEEPSEEK_API_KEY no encontrada en Vercel."
            });
        }

        // 1. LLAMADA A DEEPSEEK
        let auditResult = null;
        try {
            console.log(`[${VERSION}] Calling DeepSeek API...`);
            const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        {
                            role: "system",
                            content: "Actúa EXCLUSIVAMENTE como un Auditor de Seguridad Smart Contracts senior. Output VALID JSON ONLY."
                        },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.2
                })
            });

            const data = await dsRes.json();

            if (!dsRes.ok) {
                const errorMsg = data.error?.message || JSON.stringify(data);
                console.error(`[${VERSION}] DeepSeek Error: ${errorMsg}`);
                return res.status(dsRes.status).json({
                    success: false,
                    error: `DeepSeek API Error: ${errorMsg}`
                });
            }

            const content = data.choices?.[0]?.message?.content;
            if (content) {
                // Limpieza de JSON
                const cleanText = content.replace(/```json\n?|```/g, '').trim();
                const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    auditResult = JSON.parse(jsonMatch[0]);
                }
            }

            if (!auditResult) {
                throw new Error("La IA no devolvió un formato JSON válido.");
            }

        } catch (aiError) {
            console.error(`[${VERSION}] AI Processing Error:`, aiError.message);
            return res.status(500).json({
                success: false,
                error: `Error en procesamiento de IA: ${aiError.message}`
            });
        }

        // 2. PREPARAR DATOS FINALES
        const auditData = {
            name: address ? `Audit: ${address.slice(0, 10)}...` : "Manual Audit",
            address,
            network,
            code,
            summary: auditResult.summary,
            findings: auditResult.findings,
            created_at: new Date().toISOString()
        };

        // 3. GUARDAR EN SUPABASE (Opcional, no bloqueante)
        if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
            try {
                const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
                await supabase
                    .from('contract_audits')
                    .insert([{
                        address: address || 'manual',
                        network: network || 'unknown',
                        code_content: code,
                        result: auditData,
                        risk_score: auditData.summary?.riskScore || 0
                    }]);
                console.log(`[${VERSION}] Data saved to Supabase`);
            } catch (dbError) {
                console.warn(`[${VERSION}] Supabase error (ignoring):`, dbError.message);
            }
        }

        return res.status(200).json({
            success: true,
            audit: auditData
        });

    } catch (fatalError) {
        console.error(`[${VERSION}] Fatal Handler Error:`, fatalError.message);
        return res.status(500).json({
            success: false,
            error: `Error crítico en el servidor: ${fatalError.message}`
        });
    }
}
