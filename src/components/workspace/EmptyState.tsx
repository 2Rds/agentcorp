import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  colorClass?: string;
  chatLink?: string;
}

export function EmptyState({ icon, title, description, colorClass, chatLink }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass-card rounded-xl border-dashed"
    >
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center mb-4 bg-white/[0.06]', colorClass)}>
          {icon}
        </div>
        <h3 className="font-medium mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        {chatLink && (
          <Button variant="outline" size="sm" className="mt-4 glass-card border-white/[0.1] hover:bg-white/[0.06]" asChild>
            <Link to={chatLink}><MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Go to Chat</Link>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass-card rounded-xl border-dashed"
    >
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <h3 className="font-medium mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </div>
    </motion.div>
  );
}
