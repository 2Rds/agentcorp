import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGENTS } from '@/lib/agents';

export interface CommandItem {
  id: string;
  label: string;
  group: 'agents' | 'navigation' | 'actions';
  icon?: string;
  department?: string;
  onSelect: () => void;
}

export function useCommandSearch() {
  const navigate = useNavigate();

  const getItems = useCallback((): CommandItem[] => {
    const agentItems: CommandItem[] = AGENTS.map(agent => ({
      id: `agent-${agent.department}`,
      label: `${agent.name} — ${agent.title}`,
      group: 'agents',
      department: agent.department,
      onSelect: () => navigate(`/${agent.department}`),
    }));

    const navItems: CommandItem[] = [
      { id: 'nav-home', label: 'Dashboard', group: 'navigation', onSelect: () => navigate('/') },
      { id: 'nav-settings', label: 'Settings', group: 'navigation', onSelect: () => navigate('/settings') },
    ];

    const actionItems: CommandItem[] = [
      { id: 'action-chat-ea', label: 'Chat with Alex (EA)', group: 'actions', department: 'ea', onSelect: () => navigate('/ea') },
      { id: 'action-pipeline', label: 'View Sales Pipeline', group: 'actions', department: 'sales', onSelect: () => navigate('/sales') },
      { id: 'action-tasks', label: 'View Operations Tasks', group: 'actions', department: 'operations', onSelect: () => navigate('/operations') },
      { id: 'action-compliance', label: 'Check Compliance Status', group: 'actions', department: 'compliance', onSelect: () => navigate('/compliance') },
    ];

    return [...agentItems, ...navItems, ...actionItems];
  }, [navigate]);

  return { getItems };
}
