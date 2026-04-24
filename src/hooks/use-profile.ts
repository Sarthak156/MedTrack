import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useSupabase } from "@/hooks/use-supabase";
import type { Role } from "@/lib/supabase";

export interface Profile {
  id: string;
  clerk_user_id: string;
  role: Role;
  full_name: string | null;
}

export function useProfile() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setProfile((data as Profile | null) ?? null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isLoaded, user, supabase]);

  return { profile, loading, refresh: () => setProfile(null) };
}
