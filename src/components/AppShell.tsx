import { UserButton } from "@clerk/clerk-react";
import { NavLink } from "@/components/NavLink";
import { Pill, Activity } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import type { ReactNode } from "react";

const navByRole = {
  patient: [
    { to: "/dashboard", label: "My Meds", icon: Pill },
    { to: "/dashboard#ai-insights", label: "AI Insights", icon: Activity },
  ],
  caregiver: [{ to: "/caregiver", label: "My Patients", icon: Activity }],
  admin: [{ to: "/admin", label: "Admin", icon: Activity }],
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const items = profile ? navByRole[profile.role] : [];

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero shadow-card">
              <Pill className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">MedTrack</span>
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                activeClassName="bg-primary-soft text-primary"
              >
                {it.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {profile && (
              <span className="hidden rounded-full bg-primary-soft px-3 py-1 text-xs font-medium capitalize text-primary sm:inline">
                {profile.role}
              </span>
            )}
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        {items.length > 0 && (
          <nav className="container flex items-center gap-1 overflow-x-auto pb-2 md:hidden">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground"
                activeClassName="bg-primary-soft text-primary"
              >
                {it.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="container py-6 md:py-10">{children}</main>
    </div>
  );
}
