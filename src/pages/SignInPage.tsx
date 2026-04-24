import { SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-soft p-4">
      <Button asChild variant="ghost" size="sm" className="absolute left-4 top-4 gap-2 rounded-full bg-background/80 backdrop-blur-sm">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
      </Button>
      <SignIn
        signUpUrl="/sign-up"
        // Always redirect here after sign-in completes
        forceRedirectUrl="/"
        // For "Already have an account? Sign in" link when already on sign-in page
        signUpFallbackRedirectUrl="/sign-up"
        signUpForceRedirectUrl="/sign-up"
      />
    </div>
  );
}