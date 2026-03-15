import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { DataTable, type Column } from '@/components/workspace/DataTable';
import { ClipboardList, FileText, Mail } from 'lucide-react';

function TasksTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['ea-tasks', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('ea_tasks').select('*').eq('organization_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<ClipboardList className="h-6 w-6 text-muted-foreground" />} title="No tasks yet" description="Chat with Alex to create tasks." />;
  const priorityColor = (p: string) => p === 'urgent' ? 'bg-red-500/15 text-red-400' : p === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-white/[0.06] text-muted-foreground';
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['title', 'assigned_to']}
      searchPlaceholder="Search tasks..."
      columns={[
        { key: 'title', label: 'Title', sortable: true, className: 'font-medium' },
        { key: 'priority', label: 'Priority', sortable: true, render: (row) => <Badge className={`text-[10px] ${priorityColor(String(row.priority))}`}>{String(row.priority)}</Badge> },
        { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'assigned_to', label: 'Assigned To', className: 'text-muted-foreground' },
        { key: 'due_date', label: 'Due Date', sortable: true, render: (row) => <span className="font-mono text-xs">{row.due_date ? String(row.due_date) : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

function MeetingNotesTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['ea-meetings', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('ea_meeting_notes').select('*').eq('organization_id', orgId!).order('date', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<FileText className="h-6 w-6 text-muted-foreground" />} title="No meeting notes" description="Meeting notes will appear here after Alex records them." />;
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['title', 'summary']}
      searchPlaceholder="Search meetings..."
      columns={[
        { key: 'title', label: 'Title', sortable: true, className: 'font-medium' },
        { key: 'date', label: 'Date', sortable: true, render: (row) => <span className="font-mono text-xs">{String(row.date)}</span> },
        { key: 'attendees', label: 'Attendees', render: (row) => <span className="text-xs">{Array.isArray(row.attendees) ? (row.attendees as string[]).join(', ') : '—'}</span> },
        { key: 'summary', label: 'Summary', className: 'text-muted-foreground text-xs max-w-xs truncate' },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

function CommunicationsTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['ea-comms', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('ea_communications_log').select('*').eq('organization_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<Mail className="h-6 w-6 text-muted-foreground" />} title="No communications" description="Communications from Alex will appear here." />;
  return (
    <DataTable
      data={data as Record<string, unknown>[]}
      searchKeys={['subject']}
      searchPlaceholder="Search communications..."
      columns={[
        { key: 'type', label: 'Type', render: (row) => <Badge variant="outline" className="text-[10px]">{String(row.type)}</Badge> },
        { key: 'subject', label: 'Subject', sortable: true, className: 'font-medium' },
        { key: 'recipients', label: 'Recipients', render: (row) => <span className="text-xs text-muted-foreground">{Array.isArray(row.recipients) ? (row.recipients as string[]).join(', ') : '—'}</span> },
        { key: 'status', label: 'Status', render: (row) => <Badge variant="secondary" className="text-[10px]">{String(row.status)}</Badge> },
        { key: 'created_at', label: 'Date', render: (row) => <span className="font-mono text-xs">{row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : '—'}</span> },
      ] as Column<Record<string, unknown>>[]}
    />
  );
}

export default function EAWorkspace() {
  return <DepartmentWorkspace department="ea" tabs={[
    { id: 'tasks', label: 'Tasks', content: <TasksTab /> },
    { id: 'meetings', label: 'Meeting Notes', content: <MeetingNotesTab /> },
    { id: 'communications', label: 'Communications', content: <CommunicationsTab /> },
  ]} />;
}
