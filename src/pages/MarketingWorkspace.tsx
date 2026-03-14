import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { FileText, Megaphone } from 'lucide-react';

function ContentTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['cma-content', orgId], enabled: !!orgId,
    queryFn: async () => { const { data } = await supabase.from('cma_content_drafts').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<FileText className="h-6 w-6 text-muted-foreground" />} title="No content drafts" description="Chat with Taylor to create content." />;
  const statusColor = (s: string) => s === 'published' ? 'default' : s === 'review' ? 'secondary' : 'outline';
  return (
    <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Audience</TableHead><TableHead>Keywords</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(d => (
      <TableRow key={d.id}><TableCell className="font-medium">{d.title}</TableCell><TableCell><Badge variant="outline">{d.type}</Badge></TableCell><TableCell><Badge variant={statusColor(d.status)}>{d.status}</Badge></TableCell><TableCell className="text-muted-foreground text-sm">{d.target_audience || '—'}</TableCell><TableCell>{(d.seo_keywords as string[] | null)?.map((k, i) => <Badge key={i} variant="secondary" className="mr-1 text-[10px]">{k}</Badge>)}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

function CampaignsTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['cma-campaigns', orgId], enabled: !!orgId,
    queryFn: async () => { const { data } = await supabase.from('cma_campaigns').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<Megaphone className="h-6 w-6 text-muted-foreground" />} title="No campaigns" description="Campaigns created by Taylor will appear here." />;
  const fmt = (v: number | null) => v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v) : '—';
  return (
    <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Channels</TableHead><TableHead>Budget</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(c => (
      <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell><Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge></TableCell><TableCell>{(c.channels as string[] | null)?.map((ch, i) => <Badge key={i} variant="outline" className="mr-1 text-[10px]">{ch}</Badge>)}</TableCell><TableCell className="font-mono text-xs">{fmt(c.budget)}</TableCell><TableCell className="font-mono text-xs">{c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'}</TableCell><TableCell className="font-mono text-xs">{c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

export default function MarketingWorkspace() {
  return <DepartmentWorkspace department="marketing" tabs={[
    { id: 'content', label: 'Content', content: <ContentTab /> },
    { id: 'campaigns', label: 'Campaigns', content: <CampaignsTab /> },
  ]} />;
}
