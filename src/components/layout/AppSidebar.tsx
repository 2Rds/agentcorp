import { Home, Bot, DollarSign, Settings as SettingsIcon, Megaphone, Shield, Scale, TrendingUp, LogOut, Cog } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAgentHealth, AgentHealth } from '@/hooks/useAgentHealth';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { title: 'Dashboard', url: '/', icon: Home, dept: null },
  { title: 'EA Alex', url: '/ea', icon: Bot, dept: 'ea' },
  { title: 'Finance', url: '/finance', icon: DollarSign, dept: 'finance' },
  { title: 'Operations', url: '/operations', icon: SettingsIcon, dept: 'operations' },
  { title: 'Marketing', url: '/marketing', icon: Megaphone, dept: 'marketing' },
  { title: 'Compliance', url: '/compliance', icon: Shield, dept: 'compliance' },
  { title: 'Legal', url: '/legal', icon: Scale, dept: 'legal' },
  { title: 'Sales', url: '/sales', icon: TrendingUp, dept: 'sales' },
];

function StatusDot({ dept, healthData }: { dept: string | null; healthData?: AgentHealth[] }) {
  if (!dept || !healthData) return null;
  const h = healthData.find(a => a.agent.department === dept);
  const color = h?.status === 'online' ? 'bg-emerald-500' : h?.status === 'offline' ? 'bg-red-500' : 'bg-muted-foreground/40';
  return <span className={cn('ml-auto h-2 w-2 rounded-full shrink-0', color)} />;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { user, signOut, orgName } = useAuth();
  const { data: healthData } = useAgentHealth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">AgentCorp</p>
              <p className="text-[10px] text-muted-foreground truncate">Workforce-as-a-Service</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url || (item.url !== '/' && location.pathname.startsWith(item.url))}>
                    <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                      {!collapsed && <StatusDot dept={item.dept} healthData={healthData} />}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === '/settings'}>
              <NavLink to="/settings" className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent font-medium">
                <Cog className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">{user?.email}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
