import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef } from "react";

export interface InvestorLink {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  email: string | null;
  slug: string;
  passcode: string | null;
  require_email: boolean;
  expires_at: string | null;
  is_active: boolean;
  allowed_document_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface LinkView {
  id: string;
  link_id: string;
  organization_id: string;
  viewer_email: string | null;
  viewer_ip: string | null;
  started_at: string;
  duration_seconds: number;
  pages_viewed: number;
  total_pages: number;
  last_page_viewed: number;
  device_info: Record<string, unknown>;
  created_at: string;
}

export interface LinkAnalytics {
  link: InvestorLink;
  views: LinkView[];
  totalViews: number;
  uniqueViewers: number;
  avgDuration: number;
  avgCompletion: number;
  lastViewedAt: string | null;
}

export function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint32Array(10));
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(values[i] % chars.length);
  }
  return result;
}

/** Pure computation — extracted for testability */
export function computeLinkAnalytics(links: InvestorLink[], views: LinkView[]): LinkAnalytics[] {
  return links.map((link) => {
    const linkViews = views.filter((v) => v.link_id === link.id);
    const totalViews = linkViews.length;
    const uniqueEmails = new Set(linkViews.map((v) => v.viewer_email).filter(Boolean));
    const uniqueViewers = uniqueEmails.size || totalViews;
    const avgDuration = totalViews > 0 ? linkViews.reduce((s, v) => s + v.duration_seconds, 0) / totalViews : 0;
    const avgCompletion = totalViews > 0
      ? linkViews.reduce((s, v) => (v.total_pages > 0 ? s + v.pages_viewed / v.total_pages : s), 0) / totalViews * 100
      : 0;
    const lastViewedAt = linkViews.length > 0 ? linkViews[0].started_at : null;
    return { link, views: linkViews, totalViews, uniqueViewers, avgDuration, avgCompletion, lastViewedAt };
  });
}

export function useInvestorLinks() {
  const { orgId, user } = useAuth();
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: ["investor_links", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("investor_links")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvestorLink[];
    },
    enabled: !!orgId,
  });

  const viewsQuery = useQuery({
    queryKey: ["link_views", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("link_views")
        .select("*")
        .eq("organization_id", orgId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinkView[];
    },
    enabled: !!orgId,
  });

  // Realtime subscription for live view alerts
  const channelId = useRef(`link_views_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(channelId.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "link_views", filter: `organization_id=eq.${orgId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["link_views", orgId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, queryClient]);

  const createLink = useMutation({
    mutationFn: async (params: { name: string; email?: string; passcode?: string; require_email?: boolean; expires_at?: string; allowed_document_ids?: string[]; enable_data_room?: boolean }) => {
      if (!orgId) throw new Error("No organization");
      if (!user) throw new Error("Not authenticated");
      const slug = generateSlug();
      const { data, error } = await supabase
        .from("investor_links")
        .insert({
          organization_id: orgId,
          created_by: user.id,
          name: params.name,
          email: params.email || null,
          slug,
          passcode: params.passcode || null,
          require_email: params.require_email ?? false,
          expires_at: params.expires_at || null,
          allowed_document_ids: params.allowed_document_ids || [],
          enable_data_room: params.enable_data_room ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as InvestorLink;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investor_links", orgId] }),
  });

  const updateLink = useMutation({
    mutationFn: async (params: { id: string } & Partial<Omit<InvestorLink, "id" | "organization_id" | "created_by" | "created_at" | "updated_at" | "slug">>) => {
      const { id, ...updates } = params;
      const { data, error } = await supabase
        .from("investor_links")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as InvestorLink;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investor_links", orgId] }),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investor_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investor_links", orgId] }),
  });

  const analytics: LinkAnalytics[] = computeLinkAnalytics(linksQuery.data ?? [], viewsQuery.data ?? []);

  return {
    links: linksQuery.data ?? [],
    views: viewsQuery.data ?? [],
    analytics,
    isLoading: linksQuery.isLoading || viewsQuery.isLoading,
    createLink,
    updateLink,
    deleteLink,
  };
}
