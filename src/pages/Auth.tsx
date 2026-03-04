import { useState } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { TrendingUp, Shield, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Auth() {
  const { isSignedIn, isLoaded } = useAuthContext();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isLoaded && isSignedIn) {
    return <Navigate to={from} replace />;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
      }
    } catch (err: any) {
      setError(err.message || "Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

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

      {/* Right panel - sign in */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Chief Financial Agent</h1>
            <p className="text-muted-foreground mt-1">Sign in to continue</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Enter your email and password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="current-password"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
              <p className="text-sm text-muted-foreground text-center mt-4">
                Don't have an account?{" "}
                <Link to="/sign-up" className="text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            </CardContent>
          </Card>
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
