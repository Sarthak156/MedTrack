import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSupabase } from "@/hooks/use-supabase";
import { useServiceRoleProfile } from "@/hooks/use-service-role-profile";
import type { Role } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { HeartPulse, Loader2, User, Users } from "lucide-react";

export default function Onboarding() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const supabase = useSupabase();
  const { profile, loading, refresh } = useServiceRoleProfile();
  const [role, setRole] = useState<Exclude<Role, "admin">>("patient");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !fullName) {
      setFullName(
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
        user.username ||
        ""
      );
    }
  }, [user, fullName]);

  if (!isLoaded || loading) return null;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (profile) {
    const home =
      profile.role === "admin"
        ? "/admin"
        : profile.role === "caregiver"
        ? "/caregiver"
        : "/patient";
    return <Navigate to={home} replace />;
  }

  const submit = async () => {
    if (!fullName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    // UPSERT: if profile already exists (e.g., user re-signed in), update it.
    const payload = {
      clerk_user_id: user.id,
      role,
      full_name: fullName.trim(),
      email: user.primaryEmailAddress?.emailAddress ?? null,
    };

    let { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "clerk_user_id" });

    // Some deployments may not yet have full_name/email columns; fall back safely.
    if (error && /column .* does not exist/i.test(error.message)) {
      const fallback = await supabase
        .from("profiles")
        .upsert(
          {
            clerk_user_id: user.id,
            role,
          },
          { onConflict: "clerk_user_id" }
        );
      error = fallback.error;
    }

    setSubmitting(false);

    if (error) {
      const isApiKeyError = /invalid api key/i.test(error.message);
      toast({
        title: isApiKeyError ? "Supabase key is invalid" : "Could not save profile",
        description: isApiKeyError
          ? "Update VITE_SUPABASE_ANON_KEY in .env from Supabase > Project Settings > API, then restart the dev server."
          : error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Welcome aboard!" });
    await refresh();
    navigate(role === "caregiver" ? "/caregiver" : "/patient", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4">
      <Card className="w-full max-w-lg border-0 shadow-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to MedTrack</CardTitle>
          <p className="text-sm text-muted-foreground">Tell us a little about how you will use the app.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label>I am a…</Label>
            <RadioGroup
              value={role}
              onValueChange={(v) => setRole(v as Exclude<Role, "admin">)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  role === "patient" ? "border-primary bg-primary-soft" : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="patient" id="r-patient" className="mt-1" />
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <User className="h-4 w-4" /> Patient
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Track my own medications.</p>
                </div>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  role === "caregiver" ? "border-primary bg-primary-soft" : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="caregiver" id="r-caregiver" className="mt-1" />
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Users className="h-4 w-4" /> Caregiver
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Help others stay on track.</p>
                </div>
              </label>
            </RadioGroup>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HeartPulse className="h-3 w-3" /> Admin access is granted by an existing admin.
            </p>
          </div>

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full bg-gradient-hero"
            size="lg"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}