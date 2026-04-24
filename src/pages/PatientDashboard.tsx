import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { format, parse } from "date-fns";
import { Plus, Pill, Check, Clock, Sparkles, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSupabase } from "@/hooks/use-supabase";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "@/hooks/use-toast";
import { AIInsightsPanel } from "@/components/AIInsightsPanel";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  times: string[];
  notes: string | null;
}
interface LogRow {
  id: string;
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  status: "pending" | "taken" | "missed";
}

interface ScheduleRow {
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  status: "pending" | "taken" | "missed";
}

export default function PatientDashboard() {
  const { user } = useUser();
  const { profile } = useProfile();
  const supabase = useSupabase();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();

  const todaySchedule = useMemo(() => {
    return meds
      .flatMap((m) =>
        m.times.map((t) => {
          const scheduledISO = `${today}T${t}:00`;
          const scheduledDate = parse(scheduledISO, "yyyy-MM-dd'T'HH:mm:ss", new Date());
          const existingLog = logs.find((lg) => lg.medication_id === m.id && lg.scheduled_time.startsWith(`${today}T${t}`));
          const isTaken = existingLog?.status === "taken" || Boolean(existingLog?.taken_at);
          const isPastDue = scheduledDate.getTime() < now.getTime();
          const status: "pending" | "taken" | "missed" = isTaken ? "taken" : isPastDue ? "missed" : "pending";

          return {
            med: m,
            time: t,
            scheduledISO,
            log: existingLog,
            status,
          };
        }),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [logs, meds, now, today]);

  const scheduleHistory: ScheduleRow[] = useMemo(() => {
    return todaySchedule.map((entry) => ({
      medication_id: entry.med.id,
      scheduled_time: entry.scheduledISO,
      taken_at: entry.log?.taken_at ?? null,
      status: entry.status,
    }));
  }, [todaySchedule]);

  const summary = useMemo(() => {
    const taken = todaySchedule.filter((s) => s.status === "taken").length;
    const missed = todaySchedule.filter((s) => s.status === "missed").length;
    const pending = todaySchedule.filter((s) => s.status === "pending").length;
    const total = todaySchedule.length;
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { taken, missed, pending, total, adherence };
  }, [todaySchedule]);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [{ data: m }, { data: l }] = await Promise.all([
      supabase.from("medications").select("*").eq("patient_id", profile.id).order("created_at"),
      supabase.from("medication_logs").select("*").eq("patient_id", profile.id).gte("scheduled_time", `${today}T00:00:00`).lte("scheduled_time", `${today}T23:59:59`),
    ]);
    setMeds((m as Medication[]) ?? []);
    setLogs((l as LogRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const markTaken = async (medId: string, scheduledISO: string, existingId?: string) => {
    if (!profile) return;
    if (existingId) {
      await supabase.from("medication_logs").update({ status: "taken", taken_at: new Date().toISOString() }).eq("id", existingId);
    } else {
      await supabase.from("medication_logs").insert({
        medication_id: medId,
        patient_id: profile.id,
        scheduled_time: scheduledISO,
        taken_at: new Date().toISOString(),
        status: "taken",
      });
    }
    toast({ title: "Logged", description: "Dose marked as taken." });
    load();
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hi, {user?.firstName ?? "there"} 👋</h1>
          <p className="text-muted-foreground">Here's your plan for {format(new Date(), "EEEE, MMM d")}.</p>
        </div>
        <AddMedicationDialog open={open} setOpen={setOpen} onAdded={load} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="border-0 shadow-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5 text-primary" /> Today's medications</CardTitle>
              <span className="text-xs text-muted-foreground">
                {summary.taken} taken · {summary.missed} missed · {summary.pending} pending
              </span>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : todaySchedule.length === 0 ? (
                <EmptyState onAdd={() => setOpen(true)} />
              ) : (
                <ul className="divide-y">
                  {todaySchedule.map((s) => {
                    const taken = s.status === "taken";
                    return (
                      <li key={`${s.med.id}-${s.time}`} className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${taken ? "bg-success/15 text-success" : "bg-primary-soft text-primary"}`}>
                            <Pill className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-medium">{s.med.name} <span className="text-xs font-normal text-muted-foreground">· {s.med.dosage}</span></div>
                            <div className="text-xs text-muted-foreground">{s.time}</div>
                          </div>
                        </div>
                        <Button size="sm" variant={taken ? "secondary" : "default"} onClick={() => !taken && markTaken(s.med.id, s.scheduledISO, s.log?.id)} disabled={taken}>
                          {taken ? <><Check className="h-4 w-4" /> Taken</> : "Mark taken"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardHeader><CardTitle className="text-lg">All medications</CardTitle></CardHeader>
            <CardContent>
              {meds.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No medications yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {meds.map((m) => (
                    <div key={m.id} className="rounded-xl border bg-card p-4">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-sm text-muted-foreground">{m.dosage} · {m.frequency}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.times.map((t) => (
                          <span key={t} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div id="ai-insights" className="lg:col-span-1 scroll-mt-24">
          <AIInsightsPanel medications={meds} logs={scheduleHistory} />
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Sparkles className="h-7 w-7" /></div>
      <h3 className="mt-4 font-semibold">Start with your first medication</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">Add what you take, when you take it — we'll handle the rest.</p>
      <Button onClick={onAdd} className="mt-4 bg-gradient-hero"><Plus className="h-4 w-4" /> Add medication</Button>
    </div>
  );
}

function AddMedicationDialog({ open, setOpen, onAdded }: { open: boolean; setOpen: (b: boolean) => void; onAdded: () => void }) {
  const supabase = useSupabase();
  const { profile } = useProfile();
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("Once daily");
  const [times, setTimes] = useState("08:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setDosage(""); setFrequency("Once daily"); setTimes("08:00"); setNotes(""); };

  const submit = async () => {
    if (!profile || !name.trim() || !dosage.trim()) {
      toast({ title: "Name and dosage are required", variant: "destructive" });
      return;
    }
    const timeArr = times.split(",").map((t) => t.trim()).filter(Boolean);
    if (timeArr.length === 0) {
      toast({ title: "Add at least one time", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("medications").insert({
      patient_id: profile.id,
      name: name.trim().slice(0, 120),
      dosage: dosage.trim().slice(0, 60),
      frequency,
      times: timeArr,
      notes: notes.trim().slice(0, 500) || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Medication added" });
    reset();
    setOpen(false);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-hero shadow-card"><Plus className="h-4 w-4" /> Add medication</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add medication</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lisinopril" maxLength={120} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Dosage</Label><Input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="10 mg" maxLength={60} /></div>
            <div className="space-y-2"><Label>Frequency</Label><Input value={frequency} onChange={(e) => setFrequency(e.target.value)} maxLength={60} /></div>
          </div>
          <div className="space-y-2"><Label>Times (24h, comma-separated)</Label><Input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="08:00, 20:00" /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Take with food…" maxLength={500} /></div>
          <Button className="w-full bg-gradient-hero" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save medication
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
