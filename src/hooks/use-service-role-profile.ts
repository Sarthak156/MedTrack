import { useUser } from "@clerk/clerk-react";
import { useEffect, useState, useCallback } from "react";
import { supabaseServiceRole } from "@/lib/supabase";
import type { Role } from "@/lib/supabase";
import { useSupabase } from "@/hooks/use-supabase";

export interface Profile {
  id: string;
  clerk_user_id: string;
  role: Role;
  full_name: string | null;
  email: string | null;
}

/**
 * Service-role profile lookup — bypasses RLS entirely.
 * No JWT required — uses the service role key directly.
 * This is the most reliable way to check if a user exists and get their role.
 *
 * Used for:
 * - Auth flow: determining redirect after sign-in
 * - Admin detection (no JWT needed)
 * - Profile existence check (no auth required)
 */
async function fetchProfileByClerkUserId(clerkUserId: string): Promise<Profile | null> {
  // If service role key is not configured, fall back to null profile
  if (!import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[useServiceRoleProfile] VITE_SUPABASE_SERVICE_ROLE_KEY not set — service role fallback disabled");
    return null;
  }

  const { data, error } = await supabaseServiceRole
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    console.error("[useServiceRoleProfile] error fetching profile:", error);
    return null;
  }

  return data as Profile | null;
}

async function fetchProfileByClerkUserIdViaJwt(
  supabase: ReturnType<typeof useSupabase>,
  clerkUserId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, clerk_user_id, role, full_name, email")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    console.error("[useServiceRoleProfile] JWT profile lookup failed:", error);
    return null;
  }

  return (data as Profile | null) ?? null;
}

/**
 * Hook that uses service role to fetch profile.
 * Works even when JWT is null/missing.
 *
 * Use this in auth flows where you need to determine
 * the user's profile WITHOUT relying on their JWT being valid.
 */
export function useServiceRoleProfile() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (clerkUserId: string) => {
    // Prefer JWT-based lookup so browser auth flow works without service-role env.
    const viaJwt = await fetchProfileByClerkUserIdViaJwt(supabase, clerkUserId);
    if (viaJwt) return viaJwt;

    // Fallback for auth edge cases where JWT is unavailable or misconfigured.
    return fetchProfileByClerkUserId(clerkUserId);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    if (!isLoaded) {
      return;
    }

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    loadProfile(user.id).then((data) => {
      if (!active) return;
      setProfile(data);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isLoaded, user, loadProfile]);

  const refresh = useCallback(async () => {
    if (user) {
      setLoading(true);
      const data = await loadProfile(user.id);
      setProfile(data);
      setLoading(false);
    }
  }, [user, loadProfile]);

  return { profile, loading, refresh };
}