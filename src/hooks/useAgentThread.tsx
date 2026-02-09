import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useOrganization } from "./useOrganization";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export function useAgentThread() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // Fetch or create the single thread for this org
  useEffect(() => {
    if (!orgId || !user) {
      setThreadId(null);
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;

    const init = async () => {
      setLoadingMessages(true);

      // Try to get existing thread
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (cancelled) return;

      let id = existing?.id;

      if (!id) {
        // Auto-create the single thread
        const { data: created, error } = await supabase
          .from("conversations")
          .insert({ organization_id: orgId, title: "Agent Thread", created_by: user.id })
          .select("id")
          .single();
        if (error || cancelled) return;
        id = created?.id;
      }

      if (!id) return;
      setThreadId(id);

      // Load messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (!cancelled) {
        setMessages((msgs as Message[]) ?? []);
        setLoadingMessages(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [orgId, user]);

  const addMessage = useCallback(async (role: "user" | "assistant", content: string) => {
    if (!threadId) return null;
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: threadId, role, content })
      .select()
      .single();
    if (error) throw error;
    const msg = data as Message;
    setMessages(prev => [...prev, msg]);
    return msg;
  }, [threadId]);

  return { threadId, messages, setMessages, loadingMessages, addMessage };
}
