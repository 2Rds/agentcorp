import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AGENTS } from '@/lib/agents';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/hooks/useDashboardStats';

interface AgentMessage {
  id: string;
  sender_id: string;
  message: string;
  created_at: string | null;
}

const AGENT_BY_ID = Object.fromEntries(AGENTS.map(a => [a.id, a]));

export function NotificationBell() {
  const { orgId } = useAuth();

  const { data: messages = [] } = useQuery({
    queryKey: ['recent-agent-messages', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('agent_messages')
        .select('id, sender_id, message, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw new Error(`Failed to load notifications: ${error.message}`);
      return (data as AgentMessage[]) ?? [];
    },
    enabled: !!orgId,
    refetchInterval: 60000,
  });

  const unreadCount = messages.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative text-muted-foreground hover:text-foreground transition-colors" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center animate-scale-in">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 glass-card border-white/10">
        <div className="p-3 border-b border-white/[0.06]">
          <h4 className="text-sm font-semibold">Agent Activity</h4>
          <p className="text-xs text-muted-foreground">Recent messages from your agents</p>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No recent activity
            </div>
          ) : (
            messages.map((msg) => {
              const agent = AGENT_BY_ID[msg.sender_id];
              const dept = agent?.department ?? 'operations';
              const theme = getDeptTheme(dept);
              return (
                <div
                  key={msg.id}
                  className="px-3 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('h-2 w-2 rounded-full', theme.bg)} />
                    <span className="text-xs font-medium">{agent?.name ?? msg.sender_id}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {msg.created_at ? formatTimeAgo(msg.created_at) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 pl-4">
                    {msg.message}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
