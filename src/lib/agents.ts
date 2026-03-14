export interface AgentInfo {
  id: string;
  name: string;
  title: string;
  department: string;
  color: string;
  colorClass: string;
  prefix: string;
  apiType: 'A' | 'B';
}

export const AGENTS: AgentInfo[] = [
  { id: 'blockdrive-ea', name: 'Alex', title: 'Executive Assistant', department: 'ea', color: 'agent-ea', colorClass: 'bg-agent-ea', prefix: '/ea', apiType: 'A' },
  { id: 'blockdrive-cfa', name: 'Morgan', title: 'Chief Financial Agent', department: 'finance', color: 'agent-finance', colorClass: 'bg-agent-finance', prefix: '', apiType: 'A' },
  { id: 'blockdrive-coa', name: 'Jordan', title: 'Chief Operating Agent', department: 'operations', color: 'agent-operations', colorClass: 'bg-agent-operations', prefix: '/coa', apiType: 'B' },
  { id: 'blockdrive-cma', name: 'Taylor', title: 'Chief Marketing Agent', department: 'marketing', color: 'agent-marketing', colorClass: 'bg-agent-marketing', prefix: '/cma', apiType: 'B' },
  { id: 'blockdrive-compliance', name: 'CCO', title: 'Chief Compliance Officer', department: 'compliance', color: 'agent-compliance', colorClass: 'bg-agent-compliance', prefix: '/compliance', apiType: 'B' },
  { id: 'blockdrive-legal', name: 'Casey', title: 'Legal Counsel', department: 'legal', color: 'agent-legal', colorClass: 'bg-agent-legal', prefix: '/legal', apiType: 'B' },
  { id: 'blockdrive-sales', name: 'Sam', title: 'Head of Sales', department: 'sales', color: 'agent-sales', colorClass: 'bg-agent-sales', prefix: '/sales', apiType: 'B' },
];

export const AGENT_BY_DEPT: Record<string, AgentInfo> = Object.fromEntries(AGENTS.map(a => [a.department, a]));

export const getAgentUrl = () => import.meta.env.VITE_AGENT_URL || '';

export const getChatUrl = (agent: AgentInfo) => {
  const base = getAgentUrl();
  const chatPath = agent.apiType === 'A' ? '/api/chat' : '/chat';
  return `${base}${agent.prefix}${chatPath}`;
};

export const getHealthUrl = (agent: AgentInfo) => {
  const base = getAgentUrl();
  return `${base}${agent.prefix}/health`;
};
