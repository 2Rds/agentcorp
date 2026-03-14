import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  colorClass?: string;
  chatLink?: string;
}

export function EmptyState({ icon, title, description, colorClass, chatLink }: EmptyStateProps) {
  return (
    <Card className="border-border border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className={cn('h-12 w-12 rounded-full flex items-center justify-center mb-4 bg-muted', colorClass)}>
          {icon}
        </div>
        <h3 className="font-medium mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        {chatLink && (
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to={chatLink}><MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Go to Chat</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-border border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="font-medium mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}
