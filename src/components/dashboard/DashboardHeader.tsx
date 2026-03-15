import { useAuth } from '@/contexts/AuthContext';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { motion } from 'framer-motion';

export function DashboardHeader() {
  const { displayName } = useAuth();
  const { data: healthData } = useAgentHealth();
  const onlineCount = healthData?.filter(h => h.status === 'online').length ?? 0;

  const greeting = getGreeting();
  const name = displayName?.split(' ')[0] || 'Commander';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        {greeting}, {name}
      </h1>
      <p className="text-sm text-muted-foreground mt-0.5">
        {onlineCount > 0
          ? `${onlineCount} agent${onlineCount !== 1 ? 's' : ''} online`
          : 'Checking agent status...'}
      </p>
    </motion.div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
