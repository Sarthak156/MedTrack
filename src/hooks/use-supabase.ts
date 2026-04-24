import { useAuth } from "@clerk/clerk-react";
import { useMemo } from "react";
import { createSupabaseClient } from "@/lib/supabase";

export function useSupabase() {
  const { getToken } = useAuth();
  return useMemo(() => createSupabaseClient(getToken), [getToken]);
}
