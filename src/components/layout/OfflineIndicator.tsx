import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-destructive/90 backdrop-blur-sm text-destructive-foreground text-center text-xs py-1.5 px-4 flex items-center justify-center gap-2 animate-fade-in-down">
      <WifiOff className="h-3.5 w-3.5" />
      <span>You are offline. Some features may be unavailable.</span>
    </div>
  );
}
