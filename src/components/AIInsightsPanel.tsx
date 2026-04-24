import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle, TrendingUp } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "@/hooks/use-toast";

interface Med { id: string; name: string; dosage: string; frequency: string; times: string[] }

interface Insights {
  adherence_summary: string;
  tips: string[];
  interaction_warnings: { meds: string[]; severity: "low" | "moderate" | "high"; note: string }[];
}

export function AIInsightsPanel({ medications }: { medications: Med[] }) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Insights | null>(null);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`;

  const generate = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "supabase" });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ medications }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
        if (res.status === 402) throw new Error("AI credits exhausted.");
        throw new Error(`Edge function not deployed yet (${res.status}).`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      toast({
        title: "AI insights unavailable",
        description: e instanceof Error ? e.message : "Deploy the ai-insights edge function in supabase/functions/.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
              <div className="flex items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4 text-primary" /> Adherence</div>
              <p className="mt-1 text-sm text-muted-foreground">{data.adherence_summary}</p>
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
