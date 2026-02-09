import { useEffect, useRef, useState } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useOrganization } from "@/hooks/useOrganization";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Sparkles } from "lucide-react";

export default function Chat() {
  const { orgId } = useOrganization();
  const { conversations, activeId, setActiveId, messages, setMessages, createConversation, addMessage } = useConversations();
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (input: string) => {
    if (!orgId) return;

    let convId = activeId;
    if (!convId) {
      convId = await createConversation(input.slice(0, 60));
    }
    if (!convId) return;

    // Add user message to DB and state
    await addMessage(convId, "user", input);
    setIsStreaming(true);

    // Stream from edge function
    let assistantContent = "";
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: input }].map(m => ({ role: m.role, content: m.content })),
          organizationId: orgId,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${resp.status})`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.id?.startsWith("db-")) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: "streaming", role: "assistant" as const, content: assistantContent, created_at: new Date().toISOString() }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Save assistant message to DB
      if (assistantContent) {
        await addMessage(convId, "assistant", assistantContent);
        // Remove streaming placeholder, the addMessage will add the real one
        setMessages(prev => prev.filter(m => m.id !== "streaming"));
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages(prev => [...prev, {
        id: "error",
        role: "assistant" as const,
        content: `⚠️ ${err.message || "Something went wrong. Please try again."}`,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3rem)]">
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Your AI CFO is ready</h2>
              <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
                Ask about financial modeling, seed round strategy, investor metrics, burn rate projections, or anything related to your capital raise.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-8 w-full max-w-lg">
                {[
                  "Help me build a 24-month financial model",
                  "What should my burn rate be at seed stage?",
                  "Calculate my runway with $2M raise",
                  "What metrics do seed investors care about?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-left text-xs p-3 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((msg, i) => (
                <ChatMessage key={msg.id || i} role={msg.role} content={msg.content} />
              ))}
              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-3 py-4 px-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary animate-pulse-subtle" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
