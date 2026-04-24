export const config = {
  runtime: "edge",
};

type Med = { name: string; dosage: string; frequency: string; times: string[] };
type AdherenceLog = {
  medication_id?: string;
  scheduled_time?: string;
  taken_at?: string | null;
  status?: "pending" | "taken" | "missed";
};

type InsightsResponse = {
  title: string;
  adherence_summary: string;
  summary: string;
  tips: string[];
  reminders: string[];
  warnings: string[];
  score: number;
  interaction_warnings: { meds: string[]; severity: "low" | "moderate" | "high"; note: string }[];
  fallback?: boolean;
  error?: string;
};

function json(data: InsightsResponse | { error: string }, status = 200) {
  return Response.json(data, { status });
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildFallback(medications: Med[], logs: AdherenceLog[] = [], reason?: string): InsightsResponse {
  const medCount = medications.length;
  const taken = logs.filter((l) => l.status === "taken").length;
  const missed = logs.filter((l) => l.status === "missed").length;
  const totalTracked = Math.max(logs.length, 1);
  const score = medCount === 0 ? 0 : clampScore(((taken - missed * 0.4) / totalTracked) * 100);

  const reminders = medications.slice(0, 4).map((m) => {
    const when = Array.isArray(m.times) && m.times.length > 0 ? m.times.join(", ") : "scheduled times";
    return `Take ${m.name} (${m.dosage}) at ${when}.`;
  });

  return {
    title: "Adherence",
    adherence_summary: "Insights temporarily unavailable.",
    summary:
      medCount === 0
        ? "Add at least one medication to generate personalized adherence guidance."
        : `Tracked doses today: ${taken} taken, ${missed} missed. Keep timing consistent to improve outcomes.`,
    tips: reminders.length > 0 ? reminders : [],
    reminders: reminders.length > 0 ? reminders : ["Set reminders for each scheduled medication time."],
    warnings: missed > 0 ? ["You have missed doses today. Try a reminder strategy for the next dose window."] : [],
    score,
    interaction_warnings: [],
    fallback: true,
    error: reason,
  };
}

function normalizeInsights(payload: unknown, fallback: InsightsResponse): InsightsResponse {
  const data = payload as Partial<InsightsResponse> | null;
  if (!data || typeof data !== "object") return fallback;

  const asStrings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const tips = asStrings(data.tips);
  const reminders = asStrings(data.reminders);
  const warnings = asStrings(data.warnings);

  const interactionWarnings = Array.isArray(data.interaction_warnings)
    ? data.interaction_warnings
        .map((w) => {
          const ww = w as { meds?: unknown; severity?: unknown; note?: unknown };
          const meds = asStrings(ww.meds);
          const severity = ww.severity === "low" || ww.severity === "moderate" || ww.severity === "high" ? ww.severity : "low";
          const note = typeof ww.note === "string" ? ww.note : "Potential overlap to review with your clinician.";
          return { meds, severity, note };
        })
        .filter((w) => w.meds.length > 0)
    : [];

  const score = typeof data.score === "number" ? clampScore(data.score) : fallback.score;

  return {
    title: typeof data.title === "string" && data.title.trim() ? data.title : fallback.title,
    adherence_summary:
      typeof data.adherence_summary === "string" && data.adherence_summary.trim()
        ? data.adherence_summary
        : fallback.adherence_summary,
    summary: typeof data.summary === "string" && data.summary.trim() ? data.summary : fallback.summary,
    tips: tips.length > 0 ? tips : fallback.tips,
    reminders: reminders.length > 0 ? reminders : fallback.reminders,
    warnings: warnings.length > 0 ? warnings : fallback.warnings,
    score,
    interaction_warnings: interactionWarnings,
  };
}

async function askGemini(medications: Med[], logs: AdherenceLog[], geminiKey: string): Promise<InsightsResponse> {
  const fallback = buildFallback(medications, logs);

  const taken = logs.filter((l) => l.status === "taken").length;
  const missed = logs.filter((l) => l.status === "missed").length;
  const pending = logs.filter((l) => l.status === "pending").length;

  const userPrompt = `You are an adherence coaching assistant. Provide practical, personalized medication routine guidance.
Do not diagnose and do not provide medical treatment instructions. Include only general safety reminders.

Medication list:\n${medications
    .map((m) => `- ${m.name} ${m.dosage}; ${m.frequency}; times: ${m.times.join(", ") || "not specified"}`)
    .join("\n")}\n\nAdherence history (recent): taken=${taken}, missed=${missed}, pending=${pending}.\n\nGenerate JSON only:\n{\n  "title": "Adherence Overview",\n  "adherence_summary": "Detailed personalized summary",\n  "summary": "More context around consistency and patterns",\n  "tips": ["..."],\n  "reminders": ["..."],\n  "warnings": ["..."],\n  "score": 0-100,\n  "interaction_warnings": [{"meds": ["A","B"], "severity": "low|moderate|high", "note": "general caution"}]\n}`;

  const callGemini = async (model: string) => {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const body = {
      contents: [
        {
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 1400,
      },
    };

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[ai-insights] Gemini non-200 for model '${model}' (status=${res.status})`, text || "<empty body>");
      return { ok: false as const, status: res.status, body: text };
    }

    const raw = await res.json();
    return { ok: true as const, raw };
  };

  const preferredModel =
    (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
      ?.process?.env?.GEMINI_MODEL || "gemini-1.5-flash";

  let result = await callGemini(preferredModel);

  if (!result.ok) {
    const isModelNotFound =
      result.status === 404 || /model|not found|unsupported|unknown/i.test(result.body || "");
    if (isModelNotFound && preferredModel !== "gemini-1.5-flash") {
      result = await callGemini("gemini-1.5-flash");
    }
  }

  if (!result.ok) {
    throw new Error(`Gemini request failed (${result.status}): ${result.body || "no response body"}`);
  }

  const raw = result.raw;
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== "string") {
    return { ...fallback, error: "Gemini returned an empty response." };
  }

  try {
    const parsed = JSON.parse(text);
    return normalizeInsights(parsed, fallback);
  } catch {
    return { ...fallback, error: "Gemini returned malformed JSON." };
  }
}

function normalizeMeds(input: unknown): Med[] {
  if (!Array.isArray(input)) return [];
  return input.map((m) => {
    const mm = m as Partial<Med>;
    return {
      name: typeof mm.name === "string" ? mm.name : "Unknown",
      dosage: typeof mm.dosage === "string" ? mm.dosage : "",
      frequency: typeof mm.frequency === "string" ? mm.frequency : "",
      times: Array.isArray(mm.times) ? mm.times.filter((x): x is string => typeof x === "string") : [],
    };
  });
}

function normalizeLogs(input: unknown): AdherenceLog[] {
  if (!Array.isArray(input)) return [];
  return input.map((l) => {
    const ll = l as Partial<AdherenceLog>;
    return {
      medication_id: typeof ll.medication_id === "string" ? ll.medication_id : undefined,
      scheduled_time: typeof ll.scheduled_time === "string" ? ll.scheduled_time : undefined,
      taken_at: typeof ll.taken_at === "string" || ll.taken_at === null ? ll.taken_at : null,
      status: ll.status === "pending" || ll.status === "taken" || ll.status === "missed" ? ll.status : "pending",
    };
  });
}

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { medications?: unknown; logs?: unknown } = {};
  try {
    body = (await req.json()) as { medications?: unknown; logs?: unknown };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const medications = normalizeMeds(body.medications);
  const logs = normalizeLogs(body.logs);

  if (medications.length === 0) {
    return json({ error: "No medications provided" }, 400);
  }

  const geminiKey = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    ?.process?.env?.GEMINI_API_KEY;

  if (!geminiKey) {
    return json(buildFallback(medications, logs, "GEMINI_API_KEY is not configured on the server."));
  }

  try {
    const insights = await askGemini(medications, logs, geminiKey);
    return json(insights);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    return json(buildFallback(medications, logs, message));
  }
}
