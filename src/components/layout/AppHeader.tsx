import { Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from './Breadcrumbs';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

interface AppHeaderProps {
  onOpenCommandPalette: () => void;
}

export function AppHeader({ onOpenCommandPalette }: AppHeaderProps) {
  return (
    <header className="h-12 flex items-center border-b border-white/[0.06] px-4 shrink-0 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="mr-3 text-muted-foreground hover:text-foreground transition-colors" />

      <Breadcrumbs />

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenCommandPalette}
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground gap-2 hidden sm:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 font-mono text-[10px] font-medium text-muted-foreground hidden sm:inline-flex">
            Ctrl+K
          </kbd>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenCommandPalette}
          className="h-8 w-8 text-muted-foreground hover:text-foreground sm:hidden"
        >
          <Search className="h-4 w-4" />
        </Button>

        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
