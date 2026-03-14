import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import Onboarding from '@/pages/Onboarding';

export default function AppLayout() {
  const { orgId, isLoading } = useAuth();

  if (isLoading) return <div className="flex items-center justify-center min-h-screen bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!orgId) return <Onboarding />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border px-4 shrink-0">
            <SidebarTrigger className="mr-4" />
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
