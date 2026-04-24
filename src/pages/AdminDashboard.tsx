import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupabase } from "@/hooks/use-supabase";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2, Link as LinkIcon } from "lucide-react";
import type { Role } from "@/lib/supabase";

interface Profile { id: string; full_name: string | null; role: Role; email: string | null }
interface Assignment { id: string; caregiver_id: string; patient_id: string }

export default function AdminDashboard() {
  const supabase = useSupabase();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [caregiverId, setCaregiverId] = useState("");
  const [patientId, setPatientId] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, email").order("created_at"),
      supabase.from("caregiver_assignments").select("*"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    setAssignments((a as Assignment[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const updateRole = async (id: string, role: Role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) toast({ title: "Could not update", description: error.message, variant: "destructive" });
    else { toast({ title: "Role updated" }); load(); }
  };

  const assign = async () => {
    if (!caregiverId || !patientId) return;
    const { error } = await supabase.from("caregiver_assignments").insert({ caregiver_id: caregiverId, patient_id: patientId });
    if (error) toast({ title: "Could not assign", description: error.message, variant: "destructive" });
    else { toast({ title: "Caregiver assigned" }); setCaregiverId(""); setPatientId(""); load(); }
  };

  const removeAssign = async (id: string) => {
    await supabase.from("caregiver_assignments").delete().eq("id", id);
    load();
  };

  const caregivers = profiles.filter((p) => p.role === "caregiver");
  const patients = profiles.filter((p) => p.role === "patient");
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Manage users and caregiver assignments.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-0 shadow-card">
            <CardHeader><CardTitle>Users ({profiles.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email ?? "—"}</TableCell>
                      <TableCell>
                        <Select value={p.role} onValueChange={(v) => updateRole(p.id, v as Role)}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="patient">Patient</SelectItem>
                            <SelectItem value="caregiver">Caregiver</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardHeader><CardTitle>Caregiver assignments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Select value={caregiverId} onValueChange={setCaregiverId}>
                  <SelectTrigger><SelectValue placeholder="Caregiver" /></SelectTrigger>
                  <SelectContent>
                    {caregivers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger><SelectValue placeholder="Patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={assign} className="bg-gradient-hero"><LinkIcon className="h-4 w-4" /> Link</Button>
              </div>

              <div className="space-y-2">
                {assignments.length === 0 && <p className="text-sm text-muted-foreground">No assignments yet.</p>}
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                    <div><span className="font-medium">{nameOf(a.caregiver_id)}</span> <span className="text-muted-foreground">cares for</span> <span className="font-medium">{nameOf(a.patient_id)}</span></div>
                    <Button size="icon" variant="ghost" onClick={() => removeAssign(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
