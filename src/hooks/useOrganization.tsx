import { useState, useEffect, useCallback, useRef } from "react";
import { useClerkAuth } from "@/contexts/ClerkAuthContext";
import { useOrganizationList } from "@clerk/clerk-react";
import { supabase } from "@/integrations/supabase/client";

export function useOrganization() {
  const { activeOrganization, isOrgLoaded } = useClerkAuth();
  const orgList = useOrganizationList({ userMemberships: { infinite: true } });
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef(0);

  // Look up Supabase UUID for the active Clerk organization
  useEffect(() => {
    if (!isOrgLoaded) return;

    if (!activeOrganization) {
      setOrgId(null);
      setLoading(false);
      retryRef.current = 0;
      return;
    }

    const lookupOrgId = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("clerk_org_id", activeOrganization.id)
        .single();

      if (data?.id) {
        setOrgId(data.id);
        setLoading(false);
        retryRef.current = 0;
      } else if (retryRef.current < 5) {
        // Webhook may not have fired yet — retry with backoff
        retryRef.current += 1;
        setTimeout(lookupOrgId, 1000);
      } else {
        setOrgId(null);
        setLoading(false);
        retryRef.current = 0;
      }
    };

    lookupOrgId();
  }, [activeOrganization, isOrgLoaded]);

  const createOrganization = useCallback(async (name: string) => {
    if (!orgList?.createOrganization || !orgList?.setActive) {
      throw new Error("Organization features not loaded");
    }
    const org = await orgList.createOrganization({ name });
    await orgList.setActive({ organization: org.id });
    // Clerk webhook will create the Supabase record; useEffect picks it up
    return org.id;
  }, [orgList]);

  return { orgId, loading, createOrganization };
}
