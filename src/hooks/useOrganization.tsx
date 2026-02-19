import { useState, useEffect, useCallback, useRef } from "react";
import { useClerkAuth } from "@/contexts/ClerkAuthContext";
import { useOrganizationList } from "@clerk/clerk-react";

export function useOrganization() {
  const { activeOrganization, isOrgLoaded, supabase } = useClerkAuth();
  const orgList = useOrganizationList({ userMemberships: { infinite: true } });
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef(0);
  // Use a ref for supabase to avoid re-triggering the effect when the client reference changes
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  // Look up Supabase UUID for the active Clerk organization
  useEffect(() => {
    if (!isOrgLoaded) return;

    if (!activeOrganization) {
      setOrgId(null);
      setLoading(false);
      retryRef.current = 0;
      return;
    }

    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const lookupOrgId = async () => {
      if (cancelled) return;
      setLoading(true);
      const { data, error } = await supabaseRef.current
        .from("organizations")
        .select("id")
        .eq("clerk_org_id", activeOrganization.id)
        .single();

      if (cancelled) return;

      if (data?.id) {
        setOrgId(data.id);
        setLoading(false);
        retryRef.current = 0;
      } else if (retryRef.current < 5) {
        // Webhook may not have fired yet — retry with backoff
        if (error) console.warn(`[useOrganization] Lookup attempt ${retryRef.current + 1}/5 failed:`, error.message);
        retryRef.current += 1;
        timerHandle = setTimeout(lookupOrgId, 1000);
      } else {
        console.error("[useOrganization] Failed to resolve Clerk org to Supabase UUID after 5 retries:", activeOrganization.id);
        setOrgId(null);
        setLoading(false);
        retryRef.current = 0;
      }
    };

    lookupOrgId();

    return () => {
      cancelled = true;
      if (timerHandle) clearTimeout(timerHandle);
    };
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
