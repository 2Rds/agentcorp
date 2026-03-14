import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { Shield, AlertTriangle, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

function PoliciesTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['compliance-policies', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('compliance_policy_register').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<Shield className="h-6 w-6 text-muted-foreground" />} title="No policies" description="Compliance policies will appear here." />;
  const statusColor = (s: string) => s === 'active' ? 'bg-emerald-500/20 text-emerald-400' : s === 'under_review' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';
  return (
    <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Owner</TableHead><TableHead>Review Date</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(p => (
      <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="text-sm">{p.category}</TableCell><TableCell><Badge className={cn('text-[10px]', statusColor(p.status))}>{p.status}</Badge></TableCell><TableCell className="text-muted-foreground">{p.owner}</TableCell><TableCell className="font-mono text-xs">{p.review_date ? new Date(p.review_date).toLocaleDateString() : '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

function riskColor(likelihood: string, impact: string): string {
  const lMap: Record<string, number> = { very_low: 0, low: 1, medium: 2, high: 3, very_high: 4 };
  const iMap: Record<string, number> = { minimal: 0, minor: 1, moderate: 2, major: 3, severe: 4 };
  const score = (lMap[likelihood] ?? 2) + (iMap[impact] ?? 2);
  if (score <= 2) return 'bg-emerald-500/20 text-emerald-400';
  if (score <= 4) return 'bg-yellow-500/20 text-yellow-400';
  if (score <= 6) return 'bg-orange-500/20 text-orange-400';
  return 'bg-red-500/20 text-red-400';
}

function RiskTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['compliance-risks', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('compliance_risk_assessments').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />} title="No risk assessments" description="Risk assessments will appear here." />;
  return (
    <Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Type</TableHead><TableHead>Risk</TableHead><TableHead>Mitigation</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(r => (
      <TableRow key={r.id}><TableCell className="font-medium">{r.subject}</TableCell><TableCell><Badge variant="outline">{r.risk_type}</Badge></TableCell><TableCell><Badge className={cn('text-[10px]', riskColor(r.likelihood, r.impact))}>{r.likelihood} / {r.impact}</Badge></TableCell><TableCell className="text-muted-foreground text-sm max-w-xs truncate">{r.mitigation || '—'}</TableCell><TableCell><Badge variant="secondary">{r.status}</Badge></TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

function GovernanceTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['compliance-governance', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('compliance_governance_log').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<FileCheck className="h-6 w-6 text-muted-foreground" />} title="No governance log" description="Governance decisions will appear here." />;
  const sevColor = (s: string) => s === 'critical' ? 'destructive' : s === 'warning' ? 'default' : 'secondary';
  return (
    <Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Decision</TableHead><TableHead>Severity</TableHead><TableHead>Affected Agents</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(g => (
      <TableRow key={g.id}><TableCell className="font-medium">{g.action}</TableCell><TableCell className="text-sm max-w-xs truncate">{g.decision}</TableCell><TableCell><Badge variant={sevColor(g.severity)}>{g.severity}</Badge></TableCell><TableCell>{(g.affected_agents as string[] | null)?.map((a, i) => <Badge key={i} variant="outline" className="mr-1 text-[10px]">{a}</Badge>)}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

export default function ComplianceWorkspace() {
  return <DepartmentWorkspace department="compliance" tabs={[
    { id: 'policies', label: 'Policies', content: <PoliciesTab /> },
    { id: 'risks', label: 'Risk Assessments', content: <RiskTab /> },
    { id: 'governance', label: 'Governance Log', content: <GovernanceTab /> },
  ]} />;
}
