import type { Role } from "@/lib/supabase";

export function getRoleHome(role: Role) {
  switch (role) {
    case "admin":
      return "/admin";
    case "caregiver":
      return "/caregiver";
    default:
      return "/dashboard";
  }
}
