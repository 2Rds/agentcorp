import { useCallback } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useOrganization() {
  const { activeOrganization, orgLoading, userId, refreshOrg } = useAuthContext();

  const createOrganization = useCallback(async (name: string) => {
    if (!userId) throw new Error("Not authenticated");

    // Create the organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name })
      .select("id")
      .single();

    if (orgError || !org) throw new Error(orgError?.message || "Failed to create organization");

    // Assign user as owner — rollback org on failure
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, organization_id: org.id, role: "owner" });

    if (roleError) {
      await supabase.from("organizations").delete().eq("id", org.id);
      throw new Error(roleError.message);
    }

    // Link profile to org — rollback role + org on failure
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ organization_id: org.id })
      .eq("user_id", userId);

    if (profileError) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("organization_id", org.id);
      await supabase.from("organizations").delete().eq("id", org.id);
      throw new Error(profileError.message);
    }

    // Refresh the auth context to pick up the new org
    await refreshOrg();

    return org.id;
  }, [userId, refreshOrg]);

  return {
    orgId: activeOrganization?.id ?? null,
    loading: orgLoading,
    createOrganization,
  };
}
