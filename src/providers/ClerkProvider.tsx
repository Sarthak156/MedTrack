import { ClerkProvider } from "@clerk/clerk-react";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function AppClerkProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  if (!PUBLISHABLE_KEY || PUBLISHABLE_KEY.includes("REPLACE_ME")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 shadow-elevated">
          <h1 className="text-2xl font-semibold text-foreground">Setup required</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Add your Clerk and Supabase keys to <code className="rounded bg-muted px-1.5 py-0.5">.env</code>:
          </p>
          <pre className="mt-4 overflow-auto rounded-lg bg-muted p-4 text-xs">
{`VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
          </pre>
          <p className="mt-4 text-xs text-muted-foreground">
            Then in Clerk → JWT Templates, create a template named <strong>supabase</strong> signed with your
            Supabase JWT secret (HS256). Run the SQL in <code>supabase/migrations/</code> in your Supabase project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
