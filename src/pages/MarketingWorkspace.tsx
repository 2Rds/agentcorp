import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { DataTable, type Column } from '@/components/workspace/DataTable';
import { FileText, Megaphone } from 'lucide-react';

function ContentTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['cma-content', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('cma_content_drafts').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<FileText className="h-6 w-6 text-muted-foreground" />} title="No content drafts" description="Chat with Taylor to create content." />;
  const statusColor = (s: string) => s === 'published' ? 'bg-emerald-500/15 text-emerald-400' : s === 'review' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.06] text-muted-foreground';
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['title', 'target_audience']}
      searchPlaceholder="Search content..."
      columns={[
        { key: 'title', label: 'Title', sortable: true, className: 'font-medium' },
        { key: 'type', label: 'Type', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.type)}</Badge> },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge className={`text-[10px] ${statusColor(String(row.status))}`}>{String(row.status)}</Badge> },
        { key: 'target_audience', label: 'Audience', className: 'text-muted-foreground text-sm' },
        { key: 'seo_keywords', label: 'Keywords', render: (row) => {
          const kw = row.seo_keywords;
          if (!Array.isArray(kw)) return '—';
          return <div className="flex flex-wrap gap-1">{(kw as string[]).slice(0, 3).map((k, i) => <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>)}</div>;
        }},
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

function CampaignsTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['cma-campaigns', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('cma_campaigns').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<Megaphone className="h-6 w-6 text-muted-foreground" />} title="No campaigns" description="Campaigns created by Taylor will appear here." />;
  const fmt = (v: unknown) => {
    const n = Number(v);
    return n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
  };
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['name']}
      searchPlaceholder="Search campaigns..."
      columns={[
        { key: 'name', label: 'Name', sortable: true, className: 'font-medium' },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant={String(row.status) === 'active' ? 'default' : 'secondary'} className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'channels', label: 'Channels', render: (row) => {
          const ch = row.channels;
          if (!Array.isArray(ch)) return '—';
          return <div className="flex flex-wrap gap-1">{(ch as string[]).map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}</div>;
        }},
        { key: 'budget', label: 'Budget', sortable: true, render: (row) => <span className="font-mono text-xs">{fmt(row.budget)}</span> },
        { key: 'start_date', label: 'Start', render: (row) => <span className="font-mono text-xs">{row.start_date ? new Date(String(row.start_date)).toLocaleDateString() : '—'}</span> },
        { key: 'end_date', label: 'End', render: (row) => <span className="font-mono text-xs">{row.end_date ? new Date(String(row.end_date)).toLocaleDateString() : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

export default function MarketingWorkspace() {
  const { orgId } = useAuth();
  const filter = orgId ? `org_id=eq.${orgId}` : null;
  useRealtimeSubscription('cma_content_drafts', filter, [['cma-content', orgId!]], !!orgId);
  useRealtimeSubscription('cma_campaigns', filter, [['cma-campaigns', orgId!]], !!orgId);
  return <DepartmentWorkspace department="marketing" tabs={[
    { id: 'content', label: 'Content', content: <ContentTab /> },
    { id: 'campaigns', label: 'Campaigns', content: <CampaignsTab /> },
  ]} />;
}
