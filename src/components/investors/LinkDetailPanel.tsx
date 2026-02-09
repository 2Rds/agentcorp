import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Eye, Clock, Users, BarChart3, TrendingUp } from "lucide-react";
import { type LinkAnalytics } from "@/hooks/useInvestorLinks";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

interface LinkDetailPanelProps {
  analytics: LinkAnalytics;
}

export function LinkDetailPanel({ analytics }: LinkDetailPanelProps) {
  const { link, views, totalViews, uniqueViewers, avgDuration, avgCompletion, lastViewedAt } = analytics;
  const shareUrl = `${window.location.origin}/share/${link.slug}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  // View timeline (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  const viewsByDay = last7Days.map((day) => ({
    day: format(new Date(day), "EEE"),
    count: views.filter((v) => v.started_at.startsWith(day)).length,
  }));

  const maxCount = Math.max(...viewsByDay.map((d) => d.count), 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">{link.name}</h3>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
            <Copy className="w-3.5 h-3.5" />
            Copy Link
          </Button>
        </div>
        {link.email && <p className="text-sm text-muted-foreground">{link.email}</p>}
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={link.is_active ? "default" : "secondary"}>
            {link.is_active ? "Active" : "Disabled"}
          </Badge>
          {link.passcode && <Badge variant="outline">🔒 Passcode</Badge>}
          {link.require_email && <Badge variant="outline">📧 Email Required</Badge>}
          {link.expires_at && (
            <Badge variant="outline">
              Expires {formatDistanceToNow(new Date(link.expires_at), { addSuffix: true })}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Eye, label: "Total Views", value: totalViews, color: "text-primary" },
          { icon: Users, label: "Unique Viewers", value: uniqueViewers, color: "text-accent" },
          { icon: Clock, label: "Avg Duration", value: formatDuration(avgDuration), color: "text-primary" },
          { icon: BarChart3, label: "Avg Completion", value: `${Math.round(avgCompletion)}%`, color: "text-accent" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mini sparkline - 7 day views */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex items-end gap-1 h-16">
            {viewsByDay.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-muted rounded-sm overflow-hidden" style={{ height: "48px" }}>
                  <div
                    className="w-full bg-primary/80 rounded-sm transition-all mt-auto"
                    style={{
                      height: `${(d.count / maxCount) * 100}%`,
                      marginTop: `${100 - (d.count / maxCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent views */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Views</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          {views.length === 0 ? (
            <p className="text-xs text-muted-foreground">No views yet</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              {views.slice(0, 10).map((v) => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Eye className="w-3 h-3 text-primary" />
                    </div>
                    <span className="font-medium">{v.viewer_email || "Anonymous"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{formatDuration(v.duration_seconds)}</span>
                    <span>{v.pages_viewed}/{v.total_pages} pages</span>
                    <span>{formatDistanceToNow(new Date(v.started_at), { addSuffix: true })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last viewed */}
      {lastViewedAt && (
        <p className="text-xs text-muted-foreground text-center">
          Last viewed {formatDistanceToNow(new Date(lastViewedAt), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
