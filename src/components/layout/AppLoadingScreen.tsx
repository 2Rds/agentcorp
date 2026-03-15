import { Bot } from 'lucide-react';

export function AppLoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-pulse-ring" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-foreground">Initializing Command Center</p>
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '160ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '320ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
