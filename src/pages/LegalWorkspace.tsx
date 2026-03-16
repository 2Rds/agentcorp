import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { DataTable, type Column } from '@/components/workspace/DataTable';
import { Scale, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

function ReviewsTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['legal-reviews', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('legal_reviews').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<Scale className="h-6 w-6 text-muted-foreground" />} title="No legal reviews" description="Legal reviews by Casey will appear here." />;
  const riskColor = (r: string) => r === 'critical' ? 'bg-red-500/15 text-red-400' : r === 'high' ? 'bg-orange-500/15 text-orange-400' : r === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-emerald-500/15 text-emerald-400';
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['subject', 'summary']}
      searchPlaceholder="Search reviews..."
      columns={[
        { key: 'type', label: 'Type', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.type)}</Badge> },
        { key: 'subject', label: 'Subject', sortable: true, className: 'font-medium' },
        { key: 'risk_level', label: 'Risk', sortable: true, render: (row) => <Badge className={cn('text-[10px]', riskColor(String(row.risk_level)))}>{String(row.risk_level)}</Badge> },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant="secondary" className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'summary', label: 'Summary', className: 'text-muted-foreground text-sm max-w-xs truncate' },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

function IPTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['legal-ip', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('legal_ip_portfolio').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<FileText className="h-6 w-6 text-muted-foreground" />} title="No IP assets" description="IP portfolio items will appear here." />;
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['name']}
      searchPlaceholder="Search IP..."
      columns={[
        { key: 'name', label: 'Name', sortable: true, className: 'font-medium' },
        { key: 'type', label: 'Type', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.type)}</Badge> },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant="secondary" className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'registration_number', label: 'Reg. #', render: (row) => <span className="font-mono text-xs">{row.registration_number ? String(row.registration_number) : '—'}</span> },
        { key: 'filing_date', label: 'Filed', render: (row) => <span className="font-mono text-xs">{row.filing_date ? new Date(String(row.filing_date)).toLocaleDateString() : '—'}</span> },
        { key: 'expiry_date', label: 'Expires', render: (row) => <span className="font-mono text-xs">{row.expiry_date ? new Date(String(row.expiry_date)).toLocaleDateString() : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

export default function LegalWorkspace() {
  const { orgId } = useAuth();
  const filter = orgId ? `org_id=eq.${orgId}` : null;
  useRealtimeSubscription('legal_reviews', filter, [['legal-reviews', orgId!]], !!orgId);
  useRealtimeSubscription('legal_ip_portfolio', filter, [['legal-ip', orgId!]], !!orgId);
  return <DepartmentWorkspace department="legal" tabs={[
    { id: 'reviews', label: 'Reviews', content: <ReviewsTab /> },
    { id: 'ip', label: 'IP Portfolio', content: <IPTab /> },
  ]} />;
}
