import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Med { id: string; name: string; dosage: string; frequency: string; times: string[] }
interface LogRow {
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  status: "pending" | "taken" | "missed";
}

interface Insights {
  title: string;
  adherence_summary: string;
  summary: string;
  tips: string[];
  reminders: string[];
  warnings: string[];
  score: number;
  interaction_warnings: { meds: string[]; severity: "low" | "moderate" | "high"; note: string }[];
  reminders?: string[];
  fallback?: boolean;
  error?: string;
}

export function AIInsightsPanel({ medications, logs = [] }: { medications: Med[]; logs?: LogRow[] }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Insights | null>(null);
  const inFlightRef = useRef(false);

  const fallbackInsights = (): Insights => {
    const taken = logs.filter((l) => l.status === "taken").length;
    const missed = logs.filter((l) => l.status === "missed").length;
    const scoreBase = logs.length > 0 ? (taken / logs.length) * 100 - missed * 5 : medications.length > 0 ? 70 : 0;
    const score = Math.max(0, Math.min(100, Math.round(scoreBase)));

    const tips = medications.slice(0, 4).map((m) => {
      const when = m.times.length > 0 ? m.times.join(", ") : "your scheduled times";
      return `Take ${m.name} (${m.dosage}) at ${when}.`;
    });

    return {
      title: "Adherence",
      adherence_summary: "Insights temporarily unavailable.",
      summary: medications.length > 0
        ? `Tracked doses: ${taken} taken, ${missed} missed. Keep timing consistent for better adherence.`
        : "Add medications to generate personalized insights.",
      tips: tips.length > 0 ? tips : ["Set reminders for each dose window."],
      reminders: tips.length > 0 ? tips : ["Set reminders for each dose window."],
      warnings: missed > 0 ? ["You have missed doses today. Consider setting an evening reminder."] : [],
      score,
      interaction_warnings: [],
      fallback: true,
    };
  };

  const generate = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medications, logs }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let parsedError: { error?: string } | null = null;
        if (errorText.trim()) {
          try {
            parsedError = JSON.parse(errorText) as { error?: string };
          } catch {
            parsedError = { error: errorText };
          }
        }
        throw new Error(parsedError?.error || `AI API error (${res.status})`);
      }

      const text = await res.text();
      if (!text.trim()) {
        const fallback = fallbackInsights();
        setData(fallback);
        toast({
          title: "Enhanced AI insights unavailable right now. Showing smart local guidance.",
          description: "",
        });
        return;
      }

      let payload: Insights | { error?: string };
      try {
        payload = JSON.parse(text) as Insights | { error?: string };
      } catch {
        const fallback = fallbackInsights();
        setData(fallback);
        toast({
          title: "Enhanced AI insights unavailable right now. Showing smart local guidance.",
          description: "",
        });
        return;
      }

      const json = payload as Insights;
      const tips = Array.isArray(json.tips) && json.tips.length > 0
        ? json.tips
        : Array.isArray(json.reminders)
        ? json.reminders
        : [];

      const normalized: Insights = {
        title: json.title || "Adherence Overview",
        adherence_summary: json.adherence_summary || json.summary || fallbackInsights().adherence_summary,
        summary: json.summary || json.adherence_summary || fallbackInsights().summary,
        tips: tips.length > 0 ? tips : fallbackInsights().tips,
        reminders: Array.isArray(json.reminders) ? json.reminders : tips,
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
        score: typeof json.score === "number" ? Math.max(0, Math.min(100, Math.round(json.score))) : fallbackInsights().score,
        interaction_warnings: Array.isArray(json.interaction_warnings) ? json.interaction_warnings : [],
        fallback: json.fallback,
        error: json.error,
      };

      if (normalized.fallback) {
        toast({
          title: "Enhanced AI insights unavailable right now. Showing smart local guidance.",
          description: "",
        });
      }

      setData(normalized);
    } catch {
      const fallback = fallbackInsights();
      setData(fallback);
      toast({
        title: "Enhanced AI insights unavailable right now. Showing smart local guidance.",
        description: "",
      });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  return (
    <Card className="sticky top-24 border-0 bg-gradient-soft shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground"><Sparkles className="h-4 w-4" /></div>
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data && (
          <p className="text-sm text-muted-foreground">
            Get personalized adherence patterns and interaction warnings powered by AI.
          </p>
        )}

        {data && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4 text-primary" /> {data.title || "Adherence"}</div>
              <p className="mt-1 text-sm text-muted-foreground">{data.adherence_summary}</p>
              <p className="mt-1 text-sm text-muted-foreground">{data.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">Adherence score: <span className="font-medium text-foreground">{data.score}%</span></p>
            </div>

            {data.tips?.length > 0 && (
              <div>
                <div className="text-sm font-medium">Tips for you</div>
                <ul className="mt-2 space-y-1.5">
                  {data.tips.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground"><span className="text-primary">•</span> {t}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.interaction_warnings?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-warning" /> Interaction warnings</div>
                <div className="mt-2 space-y-2">
                  {data.interaction_warnings.map((w, i) => (
                    <div key={i} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                      <div className="font-medium">{w.meds.join(" + ")}</div>
                      <div className="text-xs uppercase tracking-wide text-warning">{w.severity}</div>
                      <p className="mt-1 text-muted-foreground">{w.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.warnings?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-warning" /> General warnings</div>
                <ul className="mt-2 space-y-1.5">
                  {data.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground"><span className="text-warning">•</span> {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Button onClick={generate} disabled={loading || medications.length === 0} className="w-full bg-gradient-hero">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {data ? "Refresh insights" : "Generate insights"}
        </Button>
        {medications.length === 0 && <p className="text-xs text-muted-foreground">Add medications first.</p>}
      </CardContent>
    </Card>
  );
}
