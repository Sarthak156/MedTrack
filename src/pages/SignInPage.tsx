import { SignIn } from "@clerk/clerk-react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4">
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