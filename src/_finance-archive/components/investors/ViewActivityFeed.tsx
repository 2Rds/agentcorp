import { Eye, Clock } from "lucide-react";
import { type LinkView, type InvestorLink } from "@/hooks/useInvestorLinks";
import { formatDistanceToNow } from "date-fns";

interface ViewActivityFeedProps {
  views: LinkView[];
  links: InvestorLink[];
}

export function ViewActivityFeed({ views, links }: ViewActivityFeedProps) {
  const recentViews = views.slice(0, 20);
  const linkMap = new Map(links.map((l) => [l.id, l]));

  if (recentViews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <Eye className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No views yet</p>
        <p className="text-xs text-muted-foreground mt-1">Share a link to start tracking engagement</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {recentViews.map((view) => {
        const link = linkMap.get(view.link_id);
        const completion = view.total_pages > 0 ? Math.round((view.pages_viewed / view.total_pages) * 100) : 0;
        return (
          <div key={view.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">
                  {view.viewer_email || link?.name || "Anonymous"}
                </span>
                <span className="text-xs text-muted-foreground">viewed</span>
                <span className="text-sm font-medium truncate">{link?.name || "Unknown"}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {view.duration_seconds > 0 ? `${Math.round(view.duration_seconds / 60)}m ${view.duration_seconds % 60}s` : "< 1s"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {view.pages_viewed}/{view.total_pages} pages
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{completion}%</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {formatDistanceToNow(new Date(view.started_at), { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
