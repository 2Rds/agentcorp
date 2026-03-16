export interface AgentInfo {
  id: string;
  name: string;
  title: string;
  department: string;
  color: string;
  colorClass: string;
  prefix: string;
  apiType: 'A' | 'B';
  description: string;
  suggestedPrompts: string[];
}

export const AGENTS: AgentInfo[] = [
  {
    id: 'blockdrive-ea', name: 'Alex', title: 'Executive Assistant', department: 'ea',
    color: 'agent-ea', colorClass: 'bg-agent-ea', prefix: '/ea', apiType: 'A',
    description: 'Your executive right hand — scheduling, comms, and coordination.',
    suggestedPrompts: ['Draft a meeting agenda for Monday', 'Summarize my open action items', 'Send a status update to the team'],
  },
  {
    id: 'blockdrive-cfa', name: 'Morgan', title: 'Chief Financial Agent', department: 'finance',
    color: 'agent-finance', colorClass: 'bg-agent-finance', prefix: '', apiType: 'A',
    description: 'Financial modeling, cap tables, and investor readiness.',
    suggestedPrompts: ['Build a 3-year revenue projection', 'Update the cap table', 'Prepare investor data room checklist'],
  },
  {
    id: 'blockdrive-coa', name: 'Jordan', title: 'Chief Operating Agent', department: 'operations',
    color: 'agent-operations', colorClass: 'bg-agent-operations', prefix: '/coa', apiType: 'B',
    description: 'Ops tasks, process optimization, and agent orchestration.',
    suggestedPrompts: ['Show task backlog by priority', 'Optimize our onboarding process', 'What agents need attention?'],
  },
  {
    id: 'blockdrive-cma', name: 'Taylor', title: 'Chief Marketing Agent', department: 'marketing',
    color: 'agent-marketing', colorClass: 'bg-agent-marketing', prefix: '/cma', apiType: 'B',
    description: 'Content creation, campaigns, and brand strategy.',
    suggestedPrompts: ['Draft a LinkedIn post about our launch', 'Plan a product launch campaign', 'Review our content calendar'],
  },
  {
    id: 'blockdrive-compliance', name: 'Parker', title: 'Chief Compliance Agent', department: 'compliance',
    color: 'agent-compliance', colorClass: 'bg-agent-compliance', prefix: '/compliance', apiType: 'B',
    description: 'Risk assessment, policy management, and regulatory compliance.',
    suggestedPrompts: ['Run a compliance risk assessment', 'Review our data privacy policy', 'What regulations apply to us?'],
  },
  {
    id: 'blockdrive-legal', name: 'Casey', title: 'Chief Legal Agent', department: 'legal',
    color: 'agent-legal', colorClass: 'bg-agent-legal', prefix: '/legal', apiType: 'B',
    description: 'Contract review, IP protection, and legal guidance.',
    suggestedPrompts: ['Review this NDA for red flags', 'Check our IP portfolio status', 'Draft terms of service'],
  },
  {
    id: 'blockdrive-sales', name: 'Sam', title: 'Chief Sales Agent', department: 'sales',
    color: 'agent-sales', colorClass: 'bg-agent-sales', prefix: '/sales', apiType: 'B',
    description: 'Pipeline management, deal tracking, and sales strategy.',
    suggestedPrompts: ['Show pipeline health summary', 'Prep for my next sales call', 'What deals need follow-up?'],
  },
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
