import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSupabase } from "@/hooks/use-supabase";
import { useProfile } from "@/hooks/use-profile";
import { Loader2, Pill, User } from "lucide-react";

interface Patient { id: string; full_name: string | null; }
interface Med { id: string; name: string; dosage: string; times: string[]; patient_id: string }

export default function CaregiverDashboard() {
  const supabase = useSupabase();
  const { profile } = useProfile();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [meds, setMeds] = useState<Med[]>([]);
  const [logsByPatient, setLogsByPatient] = useState<Record<string, { taken: number; total: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const { data: assigns } = await supabase
        .from("caregiver_assignments")
        .select("patient:patient_id(id, full_name)")
        .eq("caregiver_id", profile.id);
      const ps = (assigns ?? []).map((a: any) => a.patient).filter(Boolean) as Patient[];
      setPatients(ps);

      if (ps.length) {
        const ids = ps.map((p) => p.id);
        const { data: m } = await supabase.from("medications").select("*").in("patient_id", ids);
        setMeds((m as Med[]) ?? []);

        const today = format(new Date(), "yyyy-MM-dd");
        const { data: l } = await supabase
          .from("medication_logs")
          .select("patient_id, status")
          .in("patient_id", ids)
          .gte("scheduled_time", `${today}T00:00:00`)
          .lte("scheduled_time", `${today}T23:59:59`);
        const map: Record<string, { taken: number; total: number }> = {};
        (m as Med[] | null)?.forEach((med) => {
          map[med.patient_id] = map[med.patient_id] ?? { taken: 0, total: 0 };
          map[med.patient_id].total += med.times.length;
        });
        (l as { patient_id: string; status: string }[] | null)?.forEach((lg) => {
          if (lg.status === "taken") {
            map[lg.patient_id] = map[lg.patient_id] ?? { taken: 0, total: 0 };
            map[lg.patient_id].taken += 1;
          }
        });
        setLogsByPatient(map);
      }
      setLoading(false);
    })();
  }, [profile, supabase]);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Your patients</h1>
        <p className="text-muted-foreground">Today's adherence at a glance.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : patients.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No patients assigned yet. Ask an admin to link you.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {patients.map((p) => {
            const stats = logsByPatient[p.id] ?? { taken: 0, total: 0 };
            const pct = stats.total ? Math.round((stats.taken / stats.total) * 100) : 0;
            const patientMeds = meds.filter((m) => m.patient_id === p.id);
            return (
              <Card key={p.id} className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><User className="h-4 w-4" /></div>
                    {p.full_name ?? "Patient"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex items-end justify-between">
                    <span className="text-3xl font-bold text-primary">{pct}%</span>
                    <span className="text-sm text-muted-foreground">{stats.taken} / {stats.total} today</span>
                  </div>
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-gradient-hero transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="space-y-2">
                    {patientMeds.slice(0, 3).map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-sm">
                        <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{m.name}</span>
                        <span className="text-muted-foreground">· {m.dosage}</span>
                      </div>
                    ))}
                    {patientMeds.length > 3 && <p className="text-xs text-muted-foreground">+{patientMeds.length - 3} more</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
