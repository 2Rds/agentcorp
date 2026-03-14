import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { EmptyState } from '@/components/workspace/EmptyState';
import { ClipboardList, FileText, Mail } from 'lucide-react';

function TasksTab() {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['ea-tasks', orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from('ea_tasks').select('*').eq('organization_id', orgId!).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return data ?? []; },
  });
  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data?.length) return <EmptyState icon={<ClipboardList className="h-6 w-6 text-muted-foreground" />} title="No tasks yet" description="Chat with Alex to create tasks." />;
  const priorityColor = (p: string) => p === 'urgent' ? 'destructive' : p === 'high' ? 'default' : 'secondary';
  return (
    <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Assigned To</TableHead><TableHead>Due Date</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(t => (
      <TableRow key={t.id}><TableCell className="font-medium">{t.title}</TableCell><TableCell><Badge variant={priorityColor(t.priority)}>{t.priority}</Badge></TableCell><TableCell><Badge variant="outline">{t.status}</Badge></TableCell><TableCell className="text-muted-foreground">{t.assigned_to || '—'}</TableCell><TableCell className="text-muted-foreground font-mono text-xs">{t.due_date || '—'}</TableCell></TableRow>
    ))}</TableBody></Table>
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
    <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Date</TableHead><TableHead>Attendees</TableHead><TableHead>Summary</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(m => (
      <TableRow key={m.id}><TableCell className="font-medium">{m.title}</TableCell><TableCell className="font-mono text-xs">{m.date}</TableCell><TableCell className="text-xs">{(m.attendees as string[]).join(', ')}</TableCell><TableCell className="text-muted-foreground text-xs max-w-xs truncate">{m.summary}</TableCell></TableRow>
    ))}</TableBody></Table>
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
    <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Subject</TableHead><TableHead>Recipients</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
    <TableBody>{data.map(c => (
      <TableRow key={c.id}><TableCell><Badge variant="outline">{c.type}</Badge></TableCell><TableCell className="font-medium">{c.subject}</TableCell><TableCell className="text-xs text-muted-foreground">{(c.recipients as string[] | null)?.join(', ') || '—'}</TableCell><TableCell><Badge variant="secondary">{c.status}</Badge></TableCell><TableCell className="font-mono text-xs">{new Date(c.created_at).toLocaleDateString()}</TableCell></TableRow>
    ))}</TableBody></Table>
  );
}

export default function EAWorkspace() {
  return <DepartmentWorkspace department="ea" tabs={[
    { id: 'tasks', label: 'Tasks', content: <TasksTab /> },
    { id: 'meetings', label: 'Meeting Notes', content: <MeetingNotesTab /> },
    { id: 'communications', label: 'Communications', content: <CommunicationsTab /> },
  ]} />;
}
