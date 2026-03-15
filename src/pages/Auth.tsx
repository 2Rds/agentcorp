import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Bot } from 'lucide-react';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

export default function Auth() {
  const { isSignedIn, isLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoading) return null;
  if (isSignedIn) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center border-r border-white/[0.06] p-12 relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-glow-md">
            <Bot className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gradient">AgentCorp</h1>
            <p className="text-sm text-muted-foreground">Workforce-as-a-Service</p>
          </div>
        </div>
        <p className="text-muted-foreground text-center max-w-md text-sm leading-relaxed">
          Your unified command center for managing an AI agent workforce. 7 specialized agents, one platform.
        </p>
        <div className="mt-10 grid grid-cols-7 gap-2">
          {['ea', 'finance', 'operations', 'marketing', 'compliance', 'legal', 'sales'].map(dept => (
            <div key={dept} className={cn('h-1.5 rounded-full', getDeptTheme(dept).bg)} />
          ))}
        </div>
      </div>

      {/* Right panel - auth form */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md">
          <div className="glass-card rounded-2xl p-8 gradient-border">
            <div className="text-center mb-6">
              <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-glow-sm">
                  <Bot className="h-6 w-6 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-gradient">AgentCorp</span>
              </div>
              <h2 className="text-xl font-semibold">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
              <p className="text-sm text-muted-foreground mt-1">{isSignUp ? 'Sign up to get started' : 'Sign in to your command center'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ceo@company.com"
                  required
                  className="bg-white/[0.03] border-white/[0.08] focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="bg-white/[0.03] border-white/[0.08] focus:border-primary/50"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 press-scale"
                disabled={loading}
              >
                {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline">
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
