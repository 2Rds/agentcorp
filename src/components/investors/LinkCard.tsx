import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, Eye, Clock, Users, BarChart3, ExternalLink } from "lucide-react";
import { type LinkAnalytics, useInvestorLinks } from "@/hooks/useInvestorLinks";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface LinkCardProps {
  analytics: LinkAnalytics;
  onSelect: () => void;
  selected: boolean;
}

export function LinkCard({ analytics, onSelect, selected }: LinkCardProps) {
  const { link, totalViews, uniqueViewers, avgDuration, avgCompletion, lastViewedAt } = analytics;
  const { updateLink, deleteLink } = useInvestorLinks();
  const [copying, setCopying] = useState(false);

  const shareUrl = `${window.location.origin}/share/${link.slug}`;
  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();

  const copyLink = async () => {
    setCopying(true);
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopying(false), 1500);
  };

  const toggleActive = async () => {
    await updateLink.mutateAsync({ id: link.id, is_active: !link.is_active });
    toast.success(link.is_active ? "Link disabled" : "Link enabled");
  };

  const handleDelete = async () => {
    await deleteLink.mutateAsync(link.id);
    toast.success("Link deleted");
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
        selected ? "ring-2 ring-primary shadow-md" : ""
      } ${!link.is_active || isExpired ? "opacity-60" : ""}`}
      onClick={onSelect}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{link.name}</h3>
            {link.email && <p className="text-xs text-muted-foreground truncate">{link.email}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isExpired && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Expired</Badge>}
            {link.passcode && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">🔒</Badge>}
            {link.require_email && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">📧</Badge>}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
              <Eye className="w-3 h-3" />
            </div>
            <p className="text-sm font-semibold">{totalViews}</p>
            <p className="text-[10px] text-muted-foreground">Views</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
              <Users className="w-3 h-3" />
            </div>
            <p className="text-sm font-semibold">{uniqueViewers}</p>
            <p className="text-[10px] text-muted-foreground">Unique</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
              <Clock className="w-3 h-3" />
            </div>
            <p className="text-sm font-semibold">{formatDuration(avgDuration)}</p>
            <p className="text-[10px] text-muted-foreground">Avg Time</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
              <BarChart3 className="w-3 h-3" />
            </div>
            <p className="text-sm font-semibold">{Math.round(avgCompletion)}%</p>
            <p className="text-[10px] text-muted-foreground">Read</p>
          </div>
        </div>

        {/* Last viewed */}
        {lastViewedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last viewed {formatDistanceToNow(new Date(lastViewedAt), { addSuffix: true })}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-border" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLink}>
              {copying ? <ExternalLink className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Switch checked={link.is_active} onCheckedChange={toggleActive} />
        </div>
      </CardContent>
    </Card>
  );
}
