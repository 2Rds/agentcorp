import { ReactNode, useEffect } from 'react';
import { AGENT_BY_DEPT, AgentInfo } from '@/lib/agents';
import { posthog } from '@/lib/posthog';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import AgentChat from '@/components/chat/AgentChat';

interface WorkspaceProps {
  department: string;
  tabs: { id: string; label: string; content: ReactNode }[];
}

export default function DepartmentWorkspace({ department, tabs }: WorkspaceProps) {
  const agent = AGENT_BY_DEPT[department];
  if (!agent) throw new Error(`Unknown department: ${department}`);
  useEffect(() => { posthog.capture?.('workspace_viewed', { department }); }, [department]);
  const { data: healthData } = useAgentHealth();
  const h = healthData?.find(d => d.agent.department === department);
  const status = h?.status ?? 'unknown';

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white', agent.colorClass)}>
          {agent.name[0]}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{agent.name}</h1>
            <Badge variant={status === 'online' ? 'default' : 'secondary'} className={cn('text-[10px]', status === 'online' && 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30')}>
              {status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{agent.title}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-2 w-fit shrink-0">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          {tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="chat" className="flex-1 min-h-0 m-0">
          <AgentChat agent={agent} />
        </TabsContent>
        {tabs.map(t => (
          <TabsContent key={t.id} value={t.id} className="flex-1 overflow-auto p-6 m-0">
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
