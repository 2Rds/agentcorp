import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { TrendingUp, Phone, LayoutGrid, List } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

const STAGES = ['prospect', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const stageColor = (s: string) => s === 'closed_won' ? 'bg-emerald-500/20 text-emerald-400' : s === 'closed_lost' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary';

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
  const byStage = STAGES.map(st => ({ stage: st, count: data.filter(d => d.stage === st).length }));

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

      <Card className="border-border"><CardContent className="h-40 pt-4">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={byStage} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="stage" type="category" width={90} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="hsl(var(--agent-sales))" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>
      </CardContent></Card>

      {view === 'kanban' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map(stage => (
            <div key={stage} className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stage.replace('_', ' ')}</h3>
              {data.filter(d => d.stage === stage).map(deal => (
                <Card key={deal.id} className="border-border">
                  <CardContent className="p-3">
                    <p className="font-medium text-sm truncate">{deal.company}</p>
                    <p className="text-xs text-muted-foreground font-mono">{fmt(Number(deal.value))}</p>
                    <p className="text-[10px] text-muted-foreground">{deal.probability}% prob</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Table><TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>Stage</TableHead><TableHead>Value</TableHead><TableHead>Prob.</TableHead><TableHead>Close</TableHead></TableRow></TableHeader>
        <TableBody>{data.map(d => (
          <TableRow key={d.id}><TableCell className="font-medium">{d.company}</TableCell><TableCell className="text-muted-foreground">{d.contact || '—'}</TableCell><TableCell><Badge className={cn('text-[10px]', stageColor(d.stage))}>{d.stage}</Badge></TableCell><TableCell className="font-mono text-xs">{fmt(Number(d.value))}</TableCell><TableCell className="font-mono text-xs">{d.probability}%</TableCell><TableCell className="font-mono text-xs">{d.expected_close ? new Date(d.expected_close).toLocaleDateString() : '—'}</TableCell></TableRow>
        ))}</TableBody></Table>
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
  const sentimentEmoji = (s: string | null) => s === 'positive' ? '😊' : s === 'negative' ? '😟' : s === 'neutral' ? '😐' : '—';
  return (
    <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Summary</TableHead><TableHead>Sentiment</TableHead><TableHead>Next Steps</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(c => (
      <TableRow key={c.id}><TableCell><Badge variant="outline">{c.type}</Badge></TableCell><TableCell className="max-w-xs truncate text-sm">{c.summary}</TableCell><TableCell className="text-center">{sentimentEmoji(c.sentiment)}</TableCell><TableCell className="text-muted-foreground text-sm max-w-xs truncate">{c.next_steps || '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
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
