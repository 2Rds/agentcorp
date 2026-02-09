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

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("No session");

    const response = await supabase.functions.invoke("create-organization", {
      body: { name },
    });

    if (response.error) throw new Error(response.error.message || "Failed to create organization");
    if (response.data?.error) throw new Error(response.data.error);

    const orgId = response.data.id;
    setOrgId(orgId);
    return orgId;
  };

  return { orgId, loading, createOrganization };
}
