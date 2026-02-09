import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useOrganization() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrgId(null);
      setLoading(false);
      return;
    }

    const fetchOrg = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      setOrgId(data?.organization_id ?? null);
      setLoading(false);
    };

    fetchOrg();
  }, [user]);

  const createOrganization = async (name: string) => {
    if (!user) throw new Error("Not authenticated");

    // Create org
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name })
      .select()
      .single();
    if (orgError) throw orgError;

    // Link profile to org
    await supabase
      .from("profiles")
      .update({ organization_id: org.id })
      .eq("user_id", user.id);

    // Assign owner role
    await supabase
      .from("user_roles")
      .insert({ user_id: user.id, organization_id: org.id, role: "owner" as any });

    setOrgId(org.id);
    return org.id;
  };

  return { orgId, loading, createOrganization };
}
