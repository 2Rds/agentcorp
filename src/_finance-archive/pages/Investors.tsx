import { useState } from "react";
import { Users, Link2, Activity, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvestorLinks } from "@/hooks/useInvestorLinks";
import { CreateLinkDialog } from "@/components/investors/CreateLinkDialog";
import { LinkCard } from "@/components/investors/LinkCard";
import { LinkDetailPanel } from "@/components/investors/LinkDetailPanel";
import { ViewActivityFeed } from "@/components/investors/ViewActivityFeed";
import { EngagementChart } from "@/components/investors/EngagementChart";

export default function Investors() {
  const { links, views, analytics, isLoading } = useInvestorLinks();
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  const selectedAnalytics = analytics.find((a) => a.link.id === selectedLinkId);

  const totalViews = views.length;
  const activeLinks = links.filter((l) => l.is_active).length;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investor Portal</h1>
          <p className="text-sm text-muted-foreground">
            Share documents with granular controls and track engagement in real-time
          </p>
        </div>
        <CreateLinkDialog />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Link2, label: "Share Links", value: links.length, sub: `${activeLinks} active` },
          { icon: Eye, label: "Total Views", value: totalViews, sub: "All time" },
          { icon: Users, label: "Investors", value: new Set(links.map((l) => l.email).filter(Boolean)).size || links.length, sub: "Unique contacts" },
          { icon: Activity, label: "Avg Completion", value: `${analytics.length > 0 ? Math.round(analytics.reduce((s, a) => s + a.avgCompletion, 0) / analytics.length) : 0}%`, sub: "Across all links" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        {/* Left: Links List */}
        <div className="col-span-4 flex flex-col min-h-0">
          <Tabs defaultValue="links" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-2 mb-3">
              <TabsTrigger value="links" className="text-xs">Share Links</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">Live Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="links" className="flex-1 overflow-y-auto scrollbar-thin space-y-3 mt-0">
              {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <Link2 className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-sm font-medium mb-1">No share links yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Create a share link to start tracking investor engagement with your documents
                  </p>
                </div>
              ) : (
                analytics.map((a) => (
                  <LinkCard
                    key={a.link.id}
                    analytics={a}
                    onSelect={() => setSelectedLinkId(a.link.id === selectedLinkId ? null : a.link.id)}
                    selected={a.link.id === selectedLinkId}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="activity" className="flex-1 overflow-y-auto scrollbar-thin mt-0">
              <ViewActivityFeed views={views} links={links} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Detail Panel / Engagement Chart */}
        <div className="col-span-8 flex flex-col min-h-0 gap-6">
          {selectedAnalytics ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <LinkDetailPanel analytics={selectedAnalytics} />
            </div>
          ) : (
            <>
              <Card className="flex-1 min-h-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Engagement Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <EngagementChart analytics={analytics} />
                </CardContent>
              </Card>
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">
                  Select a share link to view detailed analytics
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
