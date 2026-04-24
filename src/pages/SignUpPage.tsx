import { SignUp } from "@clerk/clerk-react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4">
      <SignUp
        signInUrl="/sign-in"
        // Primary redirect after completing sign-up
        forceRedirectUrl="/onboarding"
        // Fallback for "Already have account? Sign in" link — stay on sign-in
        signInFallbackRedirectUrl="/sign-in"
        signInForceRedirectUrl="/sign-in"
      />
    </div>
  );
}