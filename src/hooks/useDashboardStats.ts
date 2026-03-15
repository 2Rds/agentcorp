import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AGENTS } from '@/lib/agents';

export function usePipelineValue() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['pipeline-value', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_pipeline')
        .select('value')
        .eq('org_id', orgId!)
        .not('stage', 'in', '(closed_won,closed_lost)');
      if (error) throw new Error(`Failed to load pipeline: ${error.message}`);
      return data.reduce((sum, r) => sum + (Number(r.value) || 0), 0);
    },
  });
}

export function useOpenTasks() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['open-tasks', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('coa_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .in('status', ['pending', 'in_progress']);
      if (error) throw new Error(`Failed to load tasks: ${error.message}`);
      return count ?? 0;
    },
  });
}

export function useActiveCampaigns() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['active-campaigns', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('cma_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .eq('status', 'active');
      if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
      return count ?? 0;
    },
  });
}

export interface ActivityItem {
  id: string;
  type: 'message' | 'task' | 'content' | 'review';
  description: string;
  time: string;
  agent: string;
  department: string;
}

export function useRecentActivity() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['recent-activity', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const items: ActivityItem[] = [];

      const { data: msgs, error: msgsError } = await supabase
        .from('agent_messages')
        .select('id, message, sender_id, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(5);
      if (msgsError) console.error('[useRecentActivity] agent_messages:', msgsError.message);
      msgs?.forEach(m => {
        const agent = AGENTS.find(a => a.id === m.sender_id);
        items.push({
          id: m.id,
          type: 'message',
          description: m.message.slice(0, 80),
          time: m.created_at || '',
          agent: agent?.name ?? m.sender_id,
          department: agent?.department ?? 'operations',
        });
      });

      const { data: tasks } = await supabase
        .from('coa_tasks')
        .select('id, title, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(5);
      tasks?.forEach(t =>
        items.push({
          id: t.id,
          type: 'task',
          description: t.title,
          time: t.created_at || '',
          agent: 'Jordan',
          department: 'operations',
        })
      );

      const { data: drafts } = await supabase
        .from('cma_content_drafts')
        .select('id, title, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(5);
      drafts?.forEach(d =>
        items.push({
          id: d.id,
          type: 'content',
          description: d.title,
          time: d.created_at || '',
          agent: 'Taylor',
          department: 'marketing',
        })
      );

      const { data: reviews } = await supabase
        .from('legal_reviews')
        .select('id, subject, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(5);
      reviews?.forEach(r =>
        items.push({
          id: r.id,
          type: 'review',
          description: r.subject,
          time: r.created_at || '',
          agent: 'Casey',
          department: 'legal',
        })
      );

      return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 20);
    },
  });
}

export function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}

export function formatTimeAgo(t: string): string {
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
