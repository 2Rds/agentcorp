import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="glass-card rounded-2xl p-12 text-center max-w-md mx-4 animate-scale-in relative">
        <h1 className="text-7xl font-bold text-gradient mb-4">404</h1>
        <p className="text-lg text-foreground mb-2">Page not found</p>
        <p className="text-sm text-muted-foreground mb-8">
          The route <code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">{location.pathname}</code> doesn't exist.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" className="gap-2 glass-card border-white/[0.1]" onClick={() => window.history.back()}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Go back
          </Button>
          <Button size="sm" className="gap-2 press-scale" asChild>
            <Link to="/">
              <Home className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
