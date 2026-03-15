import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, TrendingUp, CheckSquare, Shield } from 'lucide-react';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

const actions = [
  { label: 'Chat with Alex', icon: MessageSquare, path: '/ea', department: 'ea' },
  { label: 'View Pipeline', icon: TrendingUp, path: '/sales', department: 'sales' },
  { label: 'Operations Tasks', icon: CheckSquare, path: '/operations', department: 'operations' },
  { label: 'Compliance', icon: Shield, path: '/compliance', department: 'compliance' },
];

export function QuickActionBar() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-wrap gap-2"
    >
      {actions.map(action => {
        const theme = getDeptTheme(action.department);
        return (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium',
              'glass-card border-white/[0.10] hover:border-white/[0.18]',
              'hover:bg-white/[0.08] transition-all duration-200 press-scale',
              'group'
            )}
          >
            <action.icon className={cn('h-3.5 w-3.5', theme.text)} />
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
}
