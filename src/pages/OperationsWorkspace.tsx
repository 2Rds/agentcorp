import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { DataTable, type Column } from '@/components/workspace/DataTable';
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
  const pColor = (p: string) => p === 'p0' ? 'bg-red-500/15 text-red-400' : p === 'p1' ? 'bg-orange-500/15 text-orange-400' : 'bg-white/[0.06] text-muted-foreground';
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['title', 'assigned_to']}
      searchPlaceholder="Search tasks..."
      columns={[
        { key: 'title', label: 'Title', sortable: true, className: 'font-medium' },
        { key: 'priority', label: 'Priority', sortable: true, render: (row) => <Badge className={`text-[10px] ${pColor(String(row.priority))}`}>{String(row.priority)}</Badge> },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'assigned_to', label: 'Assigned', className: 'text-muted-foreground text-sm' },
        { key: 'due_date', label: 'Due', sortable: true, render: (row) => <span className="font-mono text-xs">{row.due_date ? new Date(String(row.due_date)).toLocaleDateString() : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
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
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['name']}
      searchPlaceholder="Search processes..."
      columns={[
        { key: 'name', label: 'Name', sortable: true, className: 'font-medium' },
        { key: 'owner_agent_id', label: 'Owner', className: 'text-muted-foreground' },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.status)}</Badge> },
      ] as Column<Record<string, unknown>>[]}
    />
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
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Cost by Agent</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }} />
              <Tooltip contentStyle={{ background: 'hsl(225, 45%, 5.5%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <DataTable
        data={(data.slice(0, 20)) as Record<string, unknown>[]}
        columns={[
          { key: 'agent_id', label: 'Agent', render: (row) => <span className="font-mono text-xs">{String(row.agent_id).replace('blockdrive-', '')}</span> },
          { key: 'model', label: 'Model', className: 'text-xs' },
          { key: 'input_tokens', label: 'Tokens In', render: (row) => <span className="font-mono text-xs">{String(row.input_tokens)}</span> },
          { key: 'output_tokens', label: 'Tokens Out', render: (row) => <span className="font-mono text-xs">{String(row.output_tokens)}</span> },
          { key: 'cost_usd', label: 'Cost', sortable: true, render: (row) => <span className="font-mono text-xs">${Number(row.cost_usd).toFixed(4)}</span> },
          { key: 'latency_ms', label: 'Latency', sortable: true, render: (row) => <span className="font-mono text-xs">{row.latency_ms}ms</span> },
        ] as Column<Record<string, unknown>>[]}
      />
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
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['message']}
      searchPlaceholder="Search messages..."
      columns={[
        { key: 'sender_id', label: 'From', className: 'text-xs' },
        { key: 'target_id', label: 'To', className: 'text-xs' },
        { key: 'message', label: 'Message', className: 'max-w-xs truncate text-sm' },
        { key: 'priority', label: 'Priority', render: (row) => <Badge variant={String(row.priority) === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{String(row.priority)}</Badge> },
        { key: 'status', label: 'Status', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.status)}</Badge> },
      ] as Column<Record<string, unknown>>[]}
    />
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
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['subject', 'recipient']}
      searchPlaceholder="Search comms..."
      columns={[
        { key: 'recipient', label: 'Recipient' },
        { key: 'subject', label: 'Subject', sortable: true, className: 'font-medium' },
        { key: 'type', label: 'Type', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.type)}</Badge> },
        { key: 'status', label: 'Status', render: (row) => <Badge variant="secondary" className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'created_at', label: 'Date', render: (row) => <span className="font-mono text-xs">{row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
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
