import { SignUp as ClerkSignUp, useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

export default function SignUp() {
  const { isSignedIn, isLoaded } = useAuth();

  if (isLoaded && isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <ClerkSignUp
        routing="path"
        path="/sign-up"
        signInUrl="/auth"
        afterSignUpUrl="/"
      />
    </div>
  );
}
