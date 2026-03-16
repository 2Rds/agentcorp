import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import FinancialOverviewTab from '@/components/finance/FinancialOverviewTab';
import FinancialModelTab from '@/components/finance/FinancialModelTab';
import CapTableTab from '@/components/finance/CapTableTab';
import InvestorsTab from '@/components/finance/InvestorsTab';
import KnowledgeBaseTab from '@/components/finance/KnowledgeBaseTab';

export default function FinanceWorkspace() {
  const { orgId } = useAuth();
  const filter = orgId ? `organization_id=eq.${orgId}` : null;

  // Realtime subscriptions for live data updates
  useRealtimeSubscription('financial_model', filter, [['financial-model', orgId!]], !!orgId);
  useRealtimeSubscription('cap_table_entries', filter, [['cap_table', orgId!]], !!orgId);
  useRealtimeSubscription('knowledge_base', filter, [['knowledge-base', orgId!]], !!orgId);
  useRealtimeSubscription('documents', filter, [['documents', orgId!]], !!orgId);

  return <DepartmentWorkspace department="finance" tabs={[
    { id: 'overview', label: 'Overview', content: <FinancialOverviewTab /> },
    { id: 'model', label: 'Financial Model', content: <FinancialModelTab /> },
    { id: 'captable', label: 'Cap Table', content: <CapTableTab /> },
    { id: 'investors', label: 'Investors', content: <InvestorsTab /> },
    { id: 'kb', label: 'Knowledge Base', content: <KnowledgeBaseTab /> },
  ]} />;
}
