import { useCallback } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useOrganization() {
  const { activeOrganization, orgLoading, userId, refreshOrg } = useAuthContext();

  const createOrganization = useCallback(async (name: string) => {
    if (!userId) throw new Error("Not authenticated");

    // Atomic RPC: creates org, assigns owner role, ensures profile, links org
    const { data: orgId, error } = await supabase.rpc("create_organization", {
      _name: name,
    });

    if (error || !orgId) throw new Error(error?.message || "Failed to create organization");

    // Refresh the auth context to pick up the new org
    await refreshOrg();

    return orgId as string;
  }, [userId, refreshOrg]);

  return {
    orgId: activeOrganization?.id ?? null,
    loading: orgLoading,
    createOrganization,
  };
}
