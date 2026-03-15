import { Home, Bot, DollarSign, Settings as SettingsIcon, Megaphone, Shield, Scale, TrendingUp, Cog } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAgentHealth, AgentHealth } from '@/hooks/useAgentHealth';
import { getDeptTheme } from '@/lib/department-theme';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuBadge, SidebarSeparator, useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const overviewItems = [
  { title: 'Dashboard', url: '/', icon: Home, dept: null },
];

const agentItems = [
  { title: 'EA Alex', url: '/ea', icon: Bot, dept: 'ea' },
  { title: 'Finance', url: '/finance', icon: DollarSign, dept: 'finance' },
  { title: 'Operations', url: '/operations', icon: SettingsIcon, dept: 'operations' },
  { title: 'Marketing', url: '/marketing', icon: Megaphone, dept: 'marketing' },
  { title: 'Compliance', url: '/compliance', icon: Shield, dept: 'compliance' },
  { title: 'Legal', url: '/legal', icon: Scale, dept: 'legal' },
  { title: 'Sales', url: '/sales', icon: TrendingUp, dept: 'sales' },
];

function AnimatedStatusDot({ dept, healthData }: { dept: string | null; healthData?: AgentHealth[] }) {
  if (!dept || !healthData) return null;
  const h = healthData.find(a => a.agent.department === dept);
  const isOnline = h?.status === 'online';
  const isOffline = h?.status === 'offline';
  const theme = getDeptTheme(dept);

  return (
    <span className="ml-auto relative flex h-2.5 w-2.5 shrink-0">
      {isOnline && (
        <span
          className={cn(
            'absolute inset-0 rounded-full animate-pulse-ring',
            theme.bg,
            'opacity-60'
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-flex h-2.5 w-2.5 rounded-full',
          isOnline ? theme.bg : isOffline ? 'bg-red-500' : 'bg-muted-foreground/40'
        )}
      />
    </span>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { orgName } = useAuth();
  const { data: healthData } = useAgentHealth();

  const isActive = (url: string) =>
    location.pathname === url || (url !== '/' && location.pathname.startsWith(url));

  const getActiveBorder = (dept: string | null) => {
    if (!dept) return '';
    const theme = getDeptTheme(dept);
    return theme.borderLeft;
  };

  return (
    <Sidebar collapsible="icon" className="bg-sidebar/90 backdrop-blur-xl border-r border-white/[0.06]">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-glow-sm">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">AgentCorp</p>
              {orgName ? (
                <p className="text-[10px] text-muted-foreground truncate">{orgName}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground truncate">Workforce-as-a-Service</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-glow-sm">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Overview Group */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {overviewItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-white/[0.04] transition-colors"
                      activeClassName="bg-white/[0.06] text-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="bg-white/[0.04]" />

        {/* Agents Group */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agentItems.map(item => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={cn(
                        active && item.dept ? `border-l-2 ${getActiveBorder(item.dept)} rounded-l-none` : ''
                      )}
                    >
                      <NavLink
                        to={item.url}
                        className="hover:bg-white/[0.04] transition-colors"
                        activeClassName="bg-white/[0.06] text-foreground font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.title}</span>}
                        {!collapsed && <AnimatedStatusDot dept={item.dept} healthData={healthData} />}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="bg-white/[0.04]" />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === '/settings'}>
              <NavLink
                to="/settings"
                className="hover:bg-white/[0.04] transition-colors"
                activeClassName="bg-white/[0.06] font-medium"
              >
                <Cog className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
