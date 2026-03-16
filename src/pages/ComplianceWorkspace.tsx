import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { DataTable, type Column } from '@/components/workspace/DataTable';
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
  const statusColor = (s: string) => s === 'active' ? 'bg-emerald-500/15 text-emerald-400' : s === 'under_review' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400';
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['name', 'category']}
      searchPlaceholder="Search policies..."
      columns={[
        { key: 'name', label: 'Name', sortable: true, className: 'font-medium' },
        { key: 'category', label: 'Category', sortable: true, className: 'text-sm' },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge className={cn('text-[10px]', statusColor(String(row.status)))}>{String(row.status)}</Badge> },
        { key: 'owner', label: 'Owner', className: 'text-muted-foreground' },
        { key: 'review_date', label: 'Review Date', sortable: true, render: (row) => <span className="font-mono text-xs">{row.review_date ? new Date(String(row.review_date)).toLocaleDateString() : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

function riskColor(likelihood: string, impact: string): string {
  const lMap: Record<string, number> = { very_low: 0, low: 1, medium: 2, high: 3, very_high: 4 };
  const iMap: Record<string, number> = { minimal: 0, minor: 1, moderate: 2, major: 3, severe: 4 };
  const score = (lMap[likelihood] ?? 2) + (iMap[impact] ?? 2);
  if (score <= 2) return 'bg-emerald-500/15 text-emerald-400';
  if (score <= 4) return 'bg-yellow-500/15 text-yellow-400';
  if (score <= 6) return 'bg-orange-500/15 text-orange-400';
  return 'bg-red-500/15 text-red-400';
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
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['subject']}
      searchPlaceholder="Search risks..."
      columns={[
        { key: 'subject', label: 'Subject', sortable: true, className: 'font-medium' },
        { key: 'risk_type', label: 'Type', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.risk_type)}</Badge> },
        { key: 'likelihood', label: 'Risk', render: (row) => <Badge className={cn('text-[10px]', riskColor(String(row.likelihood), String(row.impact)))}>{String(row.likelihood)} / {String(row.impact)}</Badge> },
        { key: 'mitigation', label: 'Mitigation', className: 'text-muted-foreground text-sm max-w-xs truncate' },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant="secondary" className="text-[10px]">{String(row.status)}</Badge> },
      ] as Column<Record<string, unknown>>[]}
    />
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
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['action', 'decision']}
      searchPlaceholder="Search governance..."
      columns={[
        { key: 'action', label: 'Action', sortable: true, className: 'font-medium' },
        { key: 'decision', label: 'Decision', className: 'text-sm max-w-xs truncate' },
        { key: 'severity', label: 'Severity', sortable: true, render: (row) => {
          const s = String(row.severity);
          return <Badge variant={s === 'critical' ? 'destructive' : s === 'warning' ? 'default' : 'secondary'} className="text-[10px]">{s}</Badge>;
        }},
        { key: 'affected_agents', label: 'Affected Agents', render: (row) => {
          const agents = row.affected_agents;
          if (!Array.isArray(agents)) return '—';
          return <div className="flex flex-wrap gap-1">{(agents as string[]).map((a, i) => <Badge key={i} variant="outline" className="text-[10px]">{a}</Badge>)}</div>;
        }},
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

export default function ComplianceWorkspace() {
  const { orgId } = useAuth();
  const filter = orgId ? `org_id=eq.${orgId}` : null;
  useRealtimeSubscription('compliance_policy_register', filter, [['compliance-policies', orgId!]], !!orgId);
  useRealtimeSubscription('compliance_risk_assessments', filter, [['compliance-risks', orgId!]], !!orgId);
  useRealtimeSubscription('compliance_governance_log', filter, [['compliance-governance', orgId!]], !!orgId);
  return <DepartmentWorkspace department="compliance" tabs={[
    { id: 'policies', label: 'Policies', content: <PoliciesTab /> },
    { id: 'risks', label: 'Risk Assessments', content: <RiskTab /> },
    { id: 'governance', label: 'Governance Log', content: <GovernanceTab /> },
  ]} />;
}
