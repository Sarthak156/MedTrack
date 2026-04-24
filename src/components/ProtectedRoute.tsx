import { useUser } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { useServiceRoleProfile } from "@/hooks/use-service-role-profile";
import { getRoleHome } from "@/lib/routes";
import type { Role } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: Role[];
}) {
  const { isLoaded, isSignedIn } = useUser();
  const { profile, loading } = useServiceRoleProfile();
  const location = useLocation();

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (!profile) {
    return <Navigate to="/onboarding" replace />;
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }

  return <>{children}</>;
}