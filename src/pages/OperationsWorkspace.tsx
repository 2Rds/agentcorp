import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { ClipboardList, Cog, BarChart3, MessageSquare, Mail } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function TasksTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['coa-tasks', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('coa_tasks').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<ClipboardList className="h-6 w-6 text-muted-foreground" />} title="No tasks" description="Chat with Jordan to create tasks." />;
  const pColor = (p: string) => p === 'p0' ? 'destructive' : p === 'p1' ? 'default' : 'secondary';
  return (
    <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Assigned</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(t => (
      <TableRow key={t.id}><TableCell className="font-medium">{t.title}</TableCell><TableCell><Badge variant={pColor(t.priority)}>{t.priority}</Badge></TableCell><TableCell><Badge variant="outline">{t.status}</Badge></TableCell><TableCell className="text-muted-foreground text-sm">{t.assigned_to || '—'}</TableCell><TableCell className="font-mono text-xs">{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

function ProcessesTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['coa-processes', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('coa_processes').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<Cog className="h-6 w-6 text-muted-foreground" />} title="No processes" description="Processes managed by Jordan will appear here." />;
  return (
    <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(p => (
      <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="text-muted-foreground">{p.owner_agent_id}</TableCell><TableCell><Badge variant="outline">{p.status}</Badge></TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

function AgentUsageTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['agent-usage', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('agent_usage_events').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(100); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data?.length) return <EmptyState icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />} title="No usage data" description="Agent usage metrics will appear here." />;

  const byAgent = data.reduce<Record<string, number>>((acc, e) => { acc[e.agent_id] = (acc[e.agent_id] || 0) + (Number(e.cost_usd) || 0); return acc; }, {});
  const chartData = Object.entries(byAgent).map(([name, cost]) => ({ name: name.replace('blockdrive-', ''), cost: +cost.toFixed(4) }));

  return (
    <div className="space-y-6">
      <Card className="border-border"><CardHeader><CardTitle className="text-sm">Cost by Agent</CardTitle></CardHeader><CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
      </CardContent></Card>
      <Table><TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Model</TableHead><TableHead>Tokens In</TableHead><TableHead>Tokens Out</TableHead><TableHead>Cost</TableHead><TableHead>Latency</TableHead></TableRow></TableHeader>
      <TableBody>{data.slice(0, 20).map(e => (
        <TableRow key={e.id}><TableCell className="font-mono text-xs">{e.agent_id}</TableCell><TableCell className="text-xs">{e.model}</TableCell><TableCell className="font-mono text-xs">{e.input_tokens}</TableCell><TableCell className="font-mono text-xs">{e.output_tokens}</TableCell><TableCell className="font-mono text-xs">${Number(e.cost_usd).toFixed(4)}</TableCell><TableCell className="font-mono text-xs">{e.latency_ms}ms</TableCell></TableRow>
      ))}</TableBody></Table>
    </div>
  );
}

function MessagesTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['agent-messages', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('agent_messages').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<MessageSquare className="h-6 w-6 text-muted-foreground" />} title="No messages" description="Inter-agent messages will appear here." />;
  return (
    <Table><TableHeader><TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Message</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(m => (
      <TableRow key={m.id}><TableCell className="text-xs">{m.sender_id}</TableCell><TableCell className="text-xs">{m.target_id}</TableCell><TableCell className="max-w-xs truncate text-sm">{m.message}</TableCell><TableCell><Badge variant={m.priority === 'high' ? 'destructive' : 'secondary'}>{m.priority}</Badge></TableCell><TableCell><Badge variant="outline">{m.status}</Badge></TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

function CommsTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['coa-comms', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('coa_communications').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<Mail className="h-6 w-6 text-muted-foreground" />} title="No communications" description="Operational communications will appear here." />;
  return (
    <Table><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Subject</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(c => (
      <TableRow key={c.id}><TableCell>{c.recipient}</TableCell><TableCell className="font-medium">{c.subject}</TableCell><TableCell><Badge variant="outline">{c.type}</Badge></TableCell><TableCell><Badge variant="secondary">{c.status}</Badge></TableCell><TableCell className="font-mono text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

export default function OperationsWorkspace() {
  const { orgId } = useAuth();
  const filter = orgId ? `org_id=eq.${orgId}` : null;
  useRealtimeSubscription('coa_tasks', filter, [['coa-tasks', orgId!]], !!orgId);
  useRealtimeSubscription('coa_processes', filter, [['coa-processes', orgId!]], !!orgId);
  useRealtimeSubscription('agent_usage_events', filter, [['agent-usage', orgId!]], !!orgId);
  useRealtimeSubscription('agent_messages', filter, [['agent-messages', orgId!]], !!orgId);
  useRealtimeSubscription('coa_communications', filter, [['coa-comms', orgId!]], !!orgId);
  return <DepartmentWorkspace department="operations" tabs={[
    { id: 'tasks', label: 'Tasks', content: <TasksTab /> },
    { id: 'processes', label: 'Processes', content: <ProcessesTab /> },
    { id: 'usage', label: 'Agent Usage', content: <AgentUsageTab /> },
    { id: 'messages', label: 'Messages', content: <MessagesTab /> },
    { id: 'comms', label: 'Communications', content: <CommsTab /> },
  ]} />;
}
