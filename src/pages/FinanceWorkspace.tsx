import DepartmentWorkspace from '@/components/workspace/DepartmentWorkspace';
import { PlaceholderTab } from '@/components/workspace/EmptyState';

export default function FinanceWorkspace() {
  return <DepartmentWorkspace department="finance" tabs={[
    { id: 'model', label: 'Financial Model', content: <PlaceholderTab title="Financial Model" description="Will be migrated from existing Finance app." /> },
    { id: 'captable', label: 'Cap Table', content: <PlaceholderTab title="Cap Table" description="Will be migrated from existing Finance app." /> },
    { id: 'investors', label: 'Investors', content: <PlaceholderTab title="Investor Portal" description="Will be migrated from existing Finance app." /> },
    { id: 'kb', label: 'Knowledge Base', content: <PlaceholderTab title="Knowledge Base" description="Will be migrated from existing Finance app." /> },
  ]} />;
}
