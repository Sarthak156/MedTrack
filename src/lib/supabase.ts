import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const serviceRole = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

/**
 * Service-role Supabase client — bypasses RLS completely.
 * Used ONLY for reading user profiles during auth flows.
 * DO NOT use for writes or sensitive operations.
 */
export const supabaseServiceRole = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Creates a Supabase client backed by Clerk's JWT.
 * Pass the Clerk `getToken` from `useAuth()` (with template "supabase").
 *
 * Setup in Clerk Dashboard:
 *   JWT Templates → New template → "supabase"
 *   Signing algorithm: HS256, signing key = your Supabase JWT secret.
 *
 * If getToken returns null (e.g., Clerk not loaded yet), returns
 * an unauthenticated client rather than crashing.
 */
export function createSupabaseClient(getToken: (opts: { template: string }) => Promise<string | null>) {
  return createClient(url, anon, {
    global: {
      fetch: async (input, init) => {
        const token = await getToken({ template: "supabase" });
        if (!token) return fetch(input, init);
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous client for public reads. */
export const supabasePublic = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Role = "patient" | "caregiver" | "admin";