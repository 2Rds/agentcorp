import { SignIn as ClerkSignIn, useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { TrendingUp, Shield, BarChart3 } from "lucide-react";

export default function Auth() {
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";

  if (isLoaded && isSignedIn) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div>
          <h1 className="text-3xl font-bold text-primary-foreground tracking-tight">
            Chief Financial Agent
          </h1>
          <p className="mt-1 text-primary-foreground/70 text-sm font-medium tracking-wide uppercase">
            Financial Intelligence Platform
          </p>
        </div>
        <div className="space-y-8">
          <Feature icon={TrendingUp} title="Financial Modeling" desc="AI-powered financial models with bottom-up projections" />
          <Feature icon={BarChart3} title="Investor Dashboard" desc="Real-time KPIs: burn rate, runway, MRR, CAC, LTV, unit economics" />
          <Feature icon={Shield} title="Secure Sharing" desc="Granular on-chain analytics with tokenized investor access controls" />
        </div>
        <p className="text-primary-foreground/40 text-xs">
          &copy; {new Date().getFullYear()} Chief Financial Agent. All rights reserved.
        </p>
      </div>

      {/* Right panel - Clerk sign-in */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Chief Financial Agent</h1>
            <p className="text-muted-foreground mt-1">Sign in to continue</p>
          </div>
          <ClerkSignIn
            routing="path"
            path="/auth"
            signUpUrl="/sign-up"
            afterSignInUrl="/"
          />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary-foreground" />
      </div>
      <div>
        <h3 className="font-semibold text-primary-foreground">{title}</h3>
        <p className="text-sm text-primary-foreground/60">{desc}</p>
      </div>
    </div>
  );
}
