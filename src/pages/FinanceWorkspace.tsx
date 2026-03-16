import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import FinancialModelTab from '@/components/finance/FinancialModelTab';
import FinancialOverviewTab from '@/components/finance/FinancialOverviewTab';
import InvestorsTab from '@/components/finance/InvestorsTab';
import KnowledgeBaseTab from '@/components/finance/KnowledgeBaseTab';

export default function FinanceWorkspace() {
  return <DepartmentWorkspace department="finance" tabs={[
    { id: 'overview', label: 'Overview', content: <FinancialOverviewTab /> },
    { id: 'model', label: 'Financial Model', content: <FinancialModelTab /> },
    { id: 'investors', label: 'Investors', content: <InvestorsTab /> },
    { id: 'kb', label: 'Knowledge Base', content: <KnowledgeBaseTab /> },
  ]} />;
}
