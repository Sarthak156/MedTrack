import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill, ShieldCheck, Sparkles, HeartPulse } from "lucide-react";
import { useServiceRoleProfile } from "@/hooks/use-service-role-profile";
import { Loader2 } from "lucide-react";

const features = [
  { icon: Pill, title: "Smart medication tracking", desc: "Schedule doses, log them with one tap, never miss a beat." },
  { icon: HeartPulse, title: "Caregiver visibility", desc: "Loved ones and clinicians can monitor adherence in real time." },
  { icon: Sparkles, title: "AI insights", desc: "Personalized adherence patterns and interaction warnings." },
  { icon: ShieldCheck, title: "Private & secure", desc: "Clerk auth, Supabase RLS — your data, your rules." },
];

function Authed() {
  const { profile, loading } = useServiceRoleProfile();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // No profile row → user hasn't completed onboarding yet
  if (!profile) return <Navigate to="/onboarding" replace />;

  // Profile exists → send to correct dashboard
  const home =
    profile.role === "admin"
      ? "/admin"
      : profile.role === "caregiver"
      ? "/caregiver"
      : "/patient";

  return <Navigate to={home} replace />;
}

const Index = () => {
  return (
    <>
      <SignedIn>
        <Authed />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen bg-gradient-soft">
          <header className="container flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero shadow-card">
                <Pill className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">MediMind</span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost"><Link to="/sign-in">Sign in</Link></Button>
              <Button asChild><Link to="/sign-up">Get started</Link></Button>
            </div>
          </header>

          <section className="container py-16 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" /> AI-powered medication adherence
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
                Never miss a dose. <span className="bg-gradient-hero bg-clip-text text-transparent">Ever.</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground">
                MediMind helps patients, caregivers, and clinicians stay aligned — with smart reminders,
                shared dashboards, and AI insights that catch what humans miss.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-gradient-hero shadow-elevated">
                  <Link to="/sign-up">Create your account</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/sign-in">I already have one</Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto mt-20 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <Card key={f.title} className="border-0 bg-card p-6 shadow-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </SignedOut>
    </>
  );
};

export default Index;