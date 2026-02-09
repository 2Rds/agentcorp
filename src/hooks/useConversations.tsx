import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useOrganization } from "./useOrganization";

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export function useConversations() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Fetch conversations
  useEffect(() => {
    if (!orgId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, title, created_at, updated_at")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false });
      setConversations((data as Conversation[]) ?? []);
    };
    fetch();
  }, [orgId]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setLoadingMessages(true);
    const fetch = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) ?? []);
      setLoadingMessages(false);
    };
    fetch();
  }, [activeId]);

  const createConversation = useCallback(async (title?: string) => {
    if (!orgId || !user) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ organization_id: orgId, title: title || "New Conversation", created_by: user.id })
      .select()
      .single();
    if (error) throw error;
    const conv = data as Conversation;
    setConversations(prev => [conv, ...prev]);
    setActiveId(conv.id);
    return conv.id;
  }, [orgId, user]);

  const addMessage = useCallback(async (conversationId: string, role: "user" | "assistant", content: string) => {
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role, content })
      .select()
      .single();
    if (error) throw error;
    const msg = data as Message;
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  return {
    conversations,
    activeId,
    setActiveId,
    messages,
    setMessages,
    loadingMessages,
    createConversation,
    addMessage,
  };
}
