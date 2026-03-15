import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { User, Building2, Plug } from 'lucide-react';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { AGENTS } from '@/lib/agents';
import { getDeptTheme } from '@/lib/department-theme';
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

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Profile */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold">
          <User className="h-4 w-4 text-muted-foreground" />
          Profile
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
            {initials}
          </div>
          <div>
            <p className="font-medium">{displayName || '—'}</p>
            <p className="text-xs text-muted-foreground font-mono">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Organization */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Organization
        </div>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder={orgName || 'Organization name'}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="bg-white/[0.03] border-white/[0.08]"
            />
            <Button onClick={() => { if (newName.trim()) updateOrg.mutate(newName.trim()); }} disabled={!newName.trim()}>
              Save
            </Button>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Members</Label>
            {membersLoading ? <Skeleton className="h-20 w-full" /> : (
              <div className="space-y-2">
                {members?.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]">
                    <span className="text-sm">{m.profiles?.display_name || '—'}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{m.role}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Health Grid */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold">
          <Plug className="h-4 w-4 text-muted-foreground" />
          Integrations
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <span className="text-sm font-medium">Supabase</span>
            <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">Connected</Badge>
          </div>
          {AGENTS.map(a => {
            const h = healthData?.find(d => d.agent.id === a.id);
            const theme = getDeptTheme(a.department);
            return (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', theme.bg)} />
                  <span className="text-sm">{a.name}</span>
                </div>
                <Badge
                  variant={h?.status === 'online' ? 'default' : 'secondary'}
                  className={cn('text-[10px]', h?.status === 'online' && 'bg-emerald-500/15 text-emerald-400')}
                >
                  {h?.status ?? 'unknown'}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
