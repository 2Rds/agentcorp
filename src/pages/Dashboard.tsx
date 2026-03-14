import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AGENTS } from '@/lib/agents';
import { posthog } from '@/lib/posthog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Activity, DollarSign, CheckSquare, Megaphone, Bot } from 'lucide-react';

export default function Dashboard() {
  const { orgId, displayName } = useAuth();
  const { data: healthData, isLoading: healthLoading } = useAgentHealth();

  const onlineCount = healthData?.filter(h => h.status === 'online').length ?? 0;
  const offlineCount = healthData?.filter(h => h.status === 'offline').length ?? 0;
  const unknownCount = (healthData?.length ?? 0) - onlineCount - offlineCount;

  useEffect(() => {
    if (healthData) {
      posthog.capture?.('agent_health_checked', { online_count: onlineCount, offline_count: offlineCount, unknown_count: unknownCount });
    }
  }, [healthData]);

  // Realtime subscriptions for live dashboard updates
  const rtFilter = orgId ? `org_id=eq.${orgId}` : null;
  useRealtimeSubscription('sales_pipeline', rtFilter, [['pipeline-value', orgId!]], !!orgId);
  useRealtimeSubscription('coa_tasks', rtFilter, [['open-tasks', orgId!], ['recent-activity', orgId!]], !!orgId);
  useRealtimeSubscription('cma_campaigns', rtFilter, [['active-campaigns', orgId!]], !!orgId);
  useRealtimeSubscription('agent_messages', rtFilter, [['recent-activity', orgId!]], !!orgId);
  useRealtimeSubscription('cma_content_drafts', rtFilter, [['recent-activity', orgId!]], !!orgId);
  useRealtimeSubscription('legal_reviews', rtFilter, [['recent-activity', orgId!]], !!orgId);

  const { data: pipelineValue } = useQuery({
    queryKey: ['pipeline-value', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_pipeline').select('value').eq('org_id', orgId!).not('stage', 'in', '(closed_won,closed_lost)');
      if (error) throw new Error(error.message);
      return data?.reduce((sum, r) => sum + (Number(r.value) || 0), 0) ?? 0;
    },
  });

  const { data: openTasks } = useQuery({
    queryKey: ['open-tasks', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase.from('coa_tasks').select('id', { count: 'exact', head: true }).eq('org_id', orgId!).in('status', ['pending', 'in_progress']);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const { data: activeCampaigns } = useQuery({
    queryKey: ['active-campaigns', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase.from('cma_campaigns').select('id', { count: 'exact', head: true }).eq('org_id', orgId!).eq('status', 'active');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const items: { id: string; type: string; description: string; time: string; agent: string; color: string }[] = [];
      const { data: msgs, error: msgsErr } = await supabase.from('agent_messages').select('id, message, sender_id, created_at').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(5);
      if (msgsErr) throw new Error(msgsErr.message);
      msgs?.forEach(m => items.push({ id: m.id, type: 'message', description: m.message.slice(0, 80), time: m.created_at || '', agent: m.sender_id, color: 'bg-agent-operations' }));
      const { data: tasks, error: tasksErr } = await supabase.from('coa_tasks').select('id, title, created_at').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(5);
      if (tasksErr) throw new Error(tasksErr.message);
      tasks?.forEach(t => items.push({ id: t.id, type: 'task', description: t.title, time: t.created_at || '', agent: 'Jordan', color: 'bg-agent-operations' }));
      const { data: drafts, error: draftsErr } = await supabase.from('cma_content_drafts').select('id, title, created_at').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(5);
      if (draftsErr) throw new Error(draftsErr.message);
      drafts?.forEach(d => items.push({ id: d.id, type: 'content', description: d.title, time: d.created_at || '', agent: 'Taylor', color: 'bg-agent-marketing' }));
      const { data: reviews, error: reviewsErr } = await supabase.from('legal_reviews').select('id, subject, created_at').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(5);
      if (reviewsErr) throw new Error(reviewsErr.message);
      reviews?.forEach(r => items.push({ id: r.id, type: 'review', description: r.subject, time: r.created_at || '', agent: 'Casey', color: 'bg-agent-legal' }));
      return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 20);
    },
  });

  const formatCurrency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const formatTime = (t: string) => { const d = new Date(t); if (isNaN(d.getTime())) return '—'; const now = new Date(); const diff = now.getTime() - d.getTime(); const mins = Math.floor(diff / 60000); if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Command Center</h1>
        <p className="text-sm text-muted-foreground">Agent network overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Agents Online</CardTitle><Activity className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold font-mono">{onlineCount}<span className="text-muted-foreground text-lg">/7</span></div></CardContent></Card>
        <Card className="border-border"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Value</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(pipelineValue ?? 0)}</div></CardContent></Card>
        <Card className="border-border"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Open Tasks</CardTitle><CheckSquare className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold font-mono">{openTasks ?? 0}</div></CardContent></Card>
        <Card className="border-border"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Campaigns</CardTitle><Megaphone className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold font-mono">{activeCampaigns ?? 0}</div></CardContent></Card>
      </div>

      {/* Agent Status Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Agent Fleet</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {AGENTS.map(agent => {
            const h = healthData?.find(d => d.agent.id === agent.id);
            const status = h?.status ?? 'unknown';
            return (
              <Card key={agent.id} className="border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white', agent.colorClass)}>
                      {agent.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{agent.name}</p>
                        <Badge variant={status === 'online' ? 'default' : 'secondary'} className={cn('text-[10px] px-1.5 py-0', status === 'online' && 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30')}>
                          {status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{agent.title}</p>
                      {h?.uptime && <p className="text-[10px] text-muted-foreground mt-1 font-mono">Uptime: {h.uptime}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="border-border">
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {(!recentActivity || recentActivity.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-auto">
                {recentActivity.map(item => (
                  <div key={item.id} className="flex items-start gap-3 text-sm">
                    <span className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', item.color)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{item.agent} · {formatTime(item.time)}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{item.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Org Hierarchy */}
        <Card className="border-border">
          <CardHeader><CardTitle className="text-base">Organization</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">{(displayName || 'C')[0]}</div>
                {displayName || 'CEO'} <Badge variant="secondary" className="text-[10px]">CEO</Badge>
              </div>
              <div className="ml-4 border-l border-border pl-4 space-y-1.5">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-ea" /> Alex <span className="text-muted-foreground text-xs">(EA)</span></div>
                <div className="border-l border-border ml-2 pl-4 space-y-1.5">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-operations" /> Jordan <span className="text-muted-foreground text-xs">(COA)</span></div>
                  <div className="ml-4 border-l border-border pl-4 space-y-1.5">
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-finance" /> Morgan <span className="text-muted-foreground text-xs">(CFA)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-marketing" /> Taylor <span className="text-muted-foreground text-xs">(CMA)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-compliance" /> Parker <span className="text-muted-foreground text-xs">(CCA)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-legal" /> Casey <span className="text-muted-foreground text-xs">(CLA)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-agent-sales" /> Sam <span className="text-muted-foreground text-xs">(CSA)</span></div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
