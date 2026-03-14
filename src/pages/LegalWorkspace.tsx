import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
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
  const riskColor = (r: string) => r === 'critical' ? 'bg-red-500/20 text-red-400' : r === 'high' ? 'bg-orange-500/20 text-orange-400' : r === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400';
  return (
    <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Subject</TableHead><TableHead>Risk Level</TableHead><TableHead>Status</TableHead><TableHead>Summary</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(r => (
      <TableRow key={r.id}><TableCell><Badge variant="outline">{r.type}</Badge></TableCell><TableCell className="font-medium">{r.subject}</TableCell><TableCell><Badge className={cn('text-[10px]', riskColor(r.risk_level))}>{r.risk_level}</Badge></TableCell><TableCell><Badge variant="secondary">{r.status}</Badge></TableCell><TableCell className="text-muted-foreground text-sm max-w-xs truncate">{r.summary}</TableCell></TableRow>
    ))}</TableBody></Table>
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
    <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Reg. #</TableHead><TableHead>Filed</TableHead><TableHead>Expires</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(ip => (
      <TableRow key={ip.id}><TableCell className="font-medium">{ip.name}</TableCell><TableCell><Badge variant="outline">{ip.type}</Badge></TableCell><TableCell><Badge variant="secondary">{ip.status}</Badge></TableCell><TableCell className="font-mono text-xs">{ip.registration_number || '—'}</TableCell><TableCell className="font-mono text-xs">{ip.filing_date ? new Date(ip.filing_date).toLocaleDateString() : '—'}</TableCell><TableCell className="font-mono text-xs">{ip.expiry_date ? new Date(ip.expiry_date).toLocaleDateString() : '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
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
