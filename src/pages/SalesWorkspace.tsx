import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { DataTable, type Column } from '@/components/workspace/DataTable';
import { TrendingUp, Phone, LayoutGrid, List } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

const STAGES = ['prospect', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const stageColor = (s: string) => s === 'closed_won' ? 'bg-emerald-500/15 text-emerald-400' : s === 'closed_lost' ? 'bg-red-500/15 text-red-400' : 'bg-primary/15 text-primary';

function PipelineTab() {
  const { orgId } = useAuth();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const { data, isLoading } = useQuery({
    queryKey: ['sales-pipeline', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('sales_pipeline').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data?.length) return <EmptyState icon={<TrendingUp className="h-6 w-6 text-muted-foreground" />} title="No pipeline deals" description="Chat with Sam to add pipeline deals." />;

  const fmt = (v: number | null) => v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v) : '$0';
  const totalValue = data.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).reduce((s, d) => s + (Number(d.value) || 0), 0);
  const weightedValue = data.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).reduce((s, d) => s + (Number(d.value) || 0) * (Number(d.probability) || 0) / 100, 0);
  const byStage = STAGES.map(st => ({ stage: st.replace('_', ' '), count: data.filter(d => d.stage === st).length }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div className="text-sm"><span className="text-muted-foreground">Total: </span><span className="font-mono font-bold">{fmt(totalValue)}</span></div>
          <div className="text-sm"><span className="text-muted-foreground">Weighted: </span><span className="font-mono font-bold">{fmt(weightedValue)}</span></div>
        </div>
        <div className="flex gap-1">
          <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setView('kanban')}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setView('table')}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card rounded-xl p-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byStage} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }} />
            <YAxis dataKey="stage" type="category" width={90} tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }} />
            <Tooltip contentStyle={{ background: 'hsl(225, 45%, 5.5%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Bar dataKey="count" fill="hsl(var(--agent-sales))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {view === 'kanban' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map(stage => (
            <div key={stage} className="space-y-2">
              <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{stage.replace('_', ' ')}</h3>
              {data.filter(d => d.stage === stage).map((deal, i) => (
                <motion.div
                  key={deal.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <div className="glass-card rounded-lg p-3 hover:bg-white/[0.04] transition-colors cursor-pointer">
                    <p className="font-medium text-sm truncate">{deal.company}</p>
                    <p className="text-xs text-muted-foreground font-mono">{fmt(Number(deal.value))}</p>
                    <p className="text-[10px] text-muted-foreground/60">{deal.probability}% prob</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <DataTable
          data={data as Record<string, unknown>[]}
          searchKeys={['company', 'contact']}
          searchPlaceholder="Search deals..."
          columns={[
            { key: 'company', label: 'Company', sortable: true, className: 'font-medium' },
            { key: 'contact', label: 'Contact', sortable: true, className: 'text-muted-foreground' },
            { key: 'stage', label: 'Stage', sortable: true, render: (row) => <Badge className={cn('text-[10px]', stageColor(String(row.stage)))}>{String(row.stage)}</Badge> },
            { key: 'value', label: 'Value', sortable: true, render: (row) => <span className="font-mono text-xs">{fmt(Number(row.value))}</span> },
            { key: 'probability', label: 'Prob.', sortable: true, render: (row) => <span className="font-mono text-xs">{row.probability}%</span> },
            { key: 'expected_close', label: 'Close', render: (row) => <span className="font-mono text-xs">{row.expected_close ? new Date(String(row.expected_close)).toLocaleDateString() : '—'}</span> },
          ] as Column<Record<string, unknown>>[]}
        />
      )}
    </div>
  );
}

function CallLogsTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['sales-calls', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('sales_call_logs').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<Phone className="h-6 w-6 text-muted-foreground" />} title="No call logs" description="Sales call logs from Sam will appear here." />;

  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['summary']}
      searchPlaceholder="Search call logs..."
      columns={[
        { key: 'type', label: 'Type', sortable: true, render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.type)}</Badge> },
        { key: 'summary', label: 'Summary', className: 'max-w-xs truncate text-sm' },
        { key: 'sentiment', label: 'Sentiment', render: (row) => {
          const s = String(row.sentiment || '');
          return s === 'positive' ? '😊' : s === 'negative' ? '😟' : s === 'neutral' ? '😐' : '—';
        }},
        { key: 'next_steps', label: 'Next Steps', className: 'text-muted-foreground text-sm max-w-xs truncate' },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

export default function SalesWorkspace() {
  const { orgId } = useAuth();
  const filter = orgId ? `org_id=eq.${orgId}` : null;
  useRealtimeSubscription('sales_pipeline', filter, [['sales-pipeline', orgId!]], !!orgId);
  useRealtimeSubscription('sales_call_logs', filter, [['sales-calls', orgId!]], !!orgId);
  return <DepartmentWorkspace department="sales" tabs={[
    { id: 'pipeline', label: 'Pipeline', content: <PipelineTab /> },
    { id: 'calls', label: 'Call Logs', content: <CallLogsTab /> },
  ]} />;
}
