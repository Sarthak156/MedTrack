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

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json|text)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() || trimmed;
}

function sanitizeAiText(text: string) {
  const noFences = stripCodeFences(text)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  return noFences;
}

function extractJsonText(text: string) {
  const trimmed = sanitizeAiText(text);
  if (!trimmed) return "";

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function parseBulletList(input: string) {
  return input
    .split("\n")
    .map((line) => line.replace(/^\s*[-*\u2022\d.\)]+\s*/, "").trim())
    .filter(Boolean);
}

function extractSection(text: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)\\s*${escapedLabel}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z_ ]+\\s*:|$)`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() || "";
}

function parseSectionResponse(text: string, fallback: InsightsResponse): InsightsResponse {
  const clean = sanitizeAiText(text);
  if (!clean) return { ...fallback, error: "AI returned an empty response." };

  const title = extractSection(clean, "TITLE");
  const summary = extractSection(clean, "SUMMARY");
  const tipsRaw = extractSection(clean, "TIPS");
  const warningsRaw = extractSection(clean, "WARNINGS");
  const scoreRaw = extractSection(clean, "SCORE");
  const interactionRaw = extractSection(clean, "INTERACTIONS");

  const tips = parseBulletList(tipsRaw);
  const warnings = parseBulletList(warningsRaw);
  const reminders = tips.length > 0 ? tips : fallback.reminders;

  const scoreMatch = scoreRaw.match(/-?\d+(?:\.\d+)?/);
  const score = scoreMatch ? clampScore(Number(scoreMatch[0])) : fallback.score;

  const interactionWarnings = parseBulletList(interactionRaw)
    .slice(0, 4)
    .map((line) => {
      const medTokens = line
        .split(/\+|,| and /i)
        .map((s) => s.trim())
        .filter((s) => s.length > 1)
        .slice(0, 3);
      const severity = /high/i.test(line) ? "high" : /moderate/i.test(line) ? "moderate" : "low";
      return {
        meds: medTokens.length > 0 ? medTokens : ["Medication overlap"],
        severity,
        note: line,
      };
    });

  const hasAnySection = !!(title || summary || tips.length > 0 || warnings.length > 0 || scoreMatch);
  if (!hasAnySection) {
    return { ...fallback, error: "AI response format was invalid. Showing safe fallback insights." };
  }

  return {
    title: title || fallback.title,
    adherence_summary: summary || fallback.adherence_summary,
    summary: summary || fallback.summary,
    tips: tips.length > 0 ? tips : fallback.tips,
    reminders,
    warnings: warnings.length > 0 ? warnings : fallback.warnings,
    score,
    interaction_warnings: interactionWarnings,
  };
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
Do NOT return JSON. Do NOT use markdown or code blocks.
Return plain text using EXACT section headers in this order:
TITLE:
SUMMARY:
TIPS:
WARNINGS:
SCORE:
INTERACTIONS:

Formatting rules:
- TIPS, WARNINGS, and INTERACTIONS must be bullet lines starting with "- "
- SCORE must be a single number from 0 to 100
- Keep output concise, personalized, and actionable
- Never include extra headers beyond the required ones

Medication list:\n${medications
    .map((m) => `- ${m.name} ${m.dosage}; ${m.frequency}; times: ${m.times.join(", ") || "not specified"}`)
    .join("\n")}\n\nAdherence history (recent): taken=${taken}, missed=${missed}, pending=${pending}.\n\nFocus on pattern-based coaching tailored to this exact medication list and timing behavior.`;

  const callGemini = async (model: string) => {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const body = {
      contents: [
        {
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "text/plain",
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

  const modelFallbackOrder = ["gemini-2.5-flash", "gemini-2-flash", "gemini-2-flash-lite", "gemini-2.5-pro"];

  let result = await callGemini(modelFallbackOrder[0]);

  if (!result.ok) {
    const isModelIssue =
      result.status === 404 || /model|not found|unsupported|unknown/i.test(result.body || "");

    if (isModelIssue) {
      for (const model of modelFallbackOrder.slice(1)) {
        result = await callGemini(model);
        if (result.ok) break;
      }
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

  const sanitizedText = sanitizeAiText(text);
  const sectionParsed = parseSectionResponse(sanitizedText, fallback);
  if (!sectionParsed.fallback) {
    return sectionParsed;
  }

  // Secondary compatibility path: if model still returns JSON-like content, sanitize then parse safely.
  const jsonCandidate = extractJsonText(sanitizedText);
  if (jsonCandidate.startsWith("{") && jsonCandidate.endsWith("}")) {
    try {
      const escaped = jsonCandidate
        .replace(/[\u0000-\u001F\u007F]/g, (ch) => {
          if (ch === "\n" || ch === "\t") return ch;
          return "";
        })
        .replace(/\r\n?/g, "\n");

      const parsed = JSON.parse(escaped);
      return normalizeInsights(parsed, fallback);
    } catch {
      const compact = sanitizeAiText(jsonCandidate)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ");
      const safeSummary = compact ? `AI summary: ${compact.slice(0, 420)}` : fallback.summary;
      return {
        ...fallback,
        adherence_summary: safeSummary,
        summary: safeSummary,
        tips: fallback.tips,
        error: "AI response required fallback parsing.",
      };
    }
  }

  const plain = sanitizeAiText(text);
  const lines = plain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const stitched = lines.join(" ").slice(0, 420);

  return {
    ...fallback,
    adherence_summary: stitched ? `AI summary: ${stitched}` : fallback.adherence_summary,
    summary: stitched || fallback.summary,
    error: "AI response required fallback parsing.",
  };
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
