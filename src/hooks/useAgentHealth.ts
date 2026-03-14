import { useQuery } from '@tanstack/react-query';
import { AGENTS, getHealthUrl, AgentInfo } from '@/lib/agents';

export interface AgentHealth {
  agent: AgentInfo;
  status: 'online' | 'offline' | 'unknown';
  uptime?: string;
  services?: Record<string, boolean>;
}

async function checkHealth(agent: AgentInfo): Promise<AgentHealth> {
  const url = getHealthUrl(agent);
  if (!url || !url.startsWith('http')) return { agent, status: 'unknown' };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { agent, status: 'offline' };
    const data = await res.json();
    return {
      agent,
      status: 'online',
      uptime: data.uptime,
      services: data.services,
    };
  } catch {
    return { agent, status: 'unknown' };
  }
}

export function useAgentHealth() {
  return useQuery({
    queryKey: ['agent-health'],
    queryFn: () => Promise.all(AGENTS.map(checkHealth)),
    refetchInterval: 30000,
    staleTime: 15000,
  });
}
