import { useLocation } from 'react-router-dom';
import { AGENT_BY_DEPT } from '@/lib/agents';
import { getDeptTheme } from '@/lib/department-theme';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const routeLabels: Record<string, string> = {
  ea: 'EA Alex',
  finance: 'Finance',
  operations: 'Operations',
  marketing: 'Marketing',
  compliance: 'Compliance',
  legal: 'Legal',
  sales: 'Sales',
  settings: 'Settings',
};

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1.5 text-sm">
              <Home className="h-3.5 w-3.5" />
              Command Center
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const currentSegment = segments[0];
  const label = routeLabels[currentSegment] ?? currentSegment;
  const agent = AGENT_BY_DEPT[currentSegment];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Home className="h-3 w-3" />
            Home
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="flex items-center gap-1.5 text-sm">
            {agent && (
              <span className={cn('h-2 w-2 rounded-full', getDeptTheme(agent.department).bg)} />
            )}
            {label}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
