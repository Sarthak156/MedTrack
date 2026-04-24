/// <reference lib="deno.ns" />
// Edge function: ai-insights
// Deploy:
//   supabase functions deploy ai-insights --no-verify-jwt
// Set secret:
//   supabase secrets set GEMINI_API_KEY=xxx
//
// Uses Google Gemini Pro API for AI insights.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.215.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Med { name: string; dosage: string; frequency: string; times: string[] }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { medications } = (await req.json()) as { medications: Med[] };
    if (!Array.isArray(medications) || medications.length === 0) {
      return json({ error: "No medications provided" }, 400);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "No GEMINI_API_KEY configured" }, 500);

    const model = "gemini-1.5-pro";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const systemPrompt =
      "You are a clinical pharmacist assistant. Given a patient's medication list, " +
      "return concise, friendly adherence guidance and flag any plausible interactions. " +
      "Never give a definitive diagnosis. Always recommend consulting a clinician for serious concerns.";

    const userPrompt = `Medications:\n${medications
      .map((m) => `- ${m.name} ${m.dosage}, ${m.frequency} at ${m.times.join(", ")}`)
      .join("\n")}\n\nProvide the response as a JSON object with the following structure:
{
  "adherence_summary": "1-2 sentence overview",
  "tips": ["tip1", "tip2", "tip3"],
  "interaction_warnings": [{"meds": ["med1", "med2"], "severity": "low|moderate|high", "note": "description"}]
}`;

    const body = {
      systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseSchema: {
          type: "object",
          properties: {
            adherence_summary: { type: "string" },
            tips: { type: "array", items: { type: "string" } },
            interaction_warnings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  meds: { type: "array", items: { type: "string" } },
                  severity: { type: "string", enum: ["low", "moderate", "high"] },
                  note: { type: "string" },
                },
                required: ["meds", "severity", "note"],
              },
            },
          },
          required: ["adherence_summary", "tips", "interaction_warnings"],
        },
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    };

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429) return json({ error: "Rate limited" }, 429);
    if (res.status === 402) return json({ error: "Payment required" }, 402);
    if (!res.ok) return json({ error: `AI error ${res.status}: ${await res.text()}` }, 500);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? JSON.parse(text) : null;
    if (!parsed) return json({ error: "Bad AI response" }, 500);
    return json(parsed, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
