import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { User, Building2, Plug } from 'lucide-react';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { AGENTS } from '@/lib/agents';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { user, orgId, orgName, displayName } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*, profiles(display_name)').eq('organization_id', orgId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const updateOrg = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('organizations').update({ name }).eq('id', orgId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Organization updated'); queryClient.invalidateQueries({ queryKey: ['org-members'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: healthData } = useAgentHealth();

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card className="border-border">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label className="text-xs text-muted-foreground">Display Name</Label><p className="text-sm font-medium">{displayName || '—'}</p></div>
          <div><Label className="text-xs text-muted-foreground">Email</Label><p className="text-sm font-mono">{user?.email}</p></div>
        </CardContent>
      </Card>

      {/* Organization */}
      <Card className="border-border">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Organization</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder={orgName || 'Organization name'} value={newName} onChange={e => setNewName(e.target.value)} />
            <Button onClick={() => { if (newName.trim()) updateOrg.mutate(newName.trim()); }} disabled={!newName.trim()}>Save</Button>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Members</Label>
            {membersLoading ? <Skeleton className="h-20 w-full" /> : (
              <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
              <TableBody>{members?.map((m: any) => (
                <TableRow key={m.id}><TableCell>{m.profiles?.display_name || '—'}</TableCell><TableCell><Badge variant="secondary">{m.role}</Badge></TableCell><TableCell className="font-mono text-xs">{new Date(m.created_at).toLocaleDateString()}</TableCell></TableRow>
              ))}</TableBody></Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card className="border-border">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4" /> Integrations</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="border-border"><CardContent className="p-3 flex items-center justify-between"><span className="text-sm font-medium">Supabase</span><Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Connected</Badge></CardContent></Card>
            {AGENTS.map(a => {
              const h = healthData?.find(d => d.agent.id === a.id);
              return <Card key={a.id} className="border-border"><CardContent className="p-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', a.colorClass)} /><span className="text-sm">{a.name}</span></div><Badge variant={h?.status === 'online' ? 'default' : 'secondary'} className={cn('text-[10px]', h?.status === 'online' && 'bg-emerald-500/20 text-emerald-400')}>{h?.status ?? 'unknown'}</Badge></CardContent></Card>;
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
