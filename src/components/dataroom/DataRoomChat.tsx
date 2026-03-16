import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Bot, Send, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DataRoomChatProps {
  agentUrl: string;
  slug: string;
  passcode: string;
  email: string;
  sessionId: string;
}

export function DataRoomChat({ agentUrl, slug, passcode, email, sessionId }: DataRoomChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const resp = await fetch(`${agentUrl}/dataroom/${slug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, passcode, email, sessionId }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      setMessages(prev => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I couldn't answer that. ${err.message || "Please try again."}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto flex flex-col h-[600px] border-border/50">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium">Ask about this company's financials</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ask questions about revenue, burn rate, runway, cap table, and more.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <Bot className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Ask me anything about the company's financials, metrics, or cap table.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {["What's the current MRR?", "Show the burn rate trend", "Cap table breakdown"].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border"
            }`}>
              {msg.role === "user" ? (
                <p>{msg.content}</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-secondary flex items-center justify-center mt-0.5">
                <User className="w-3.5 h-3.5 text-secondary-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-2xl px-4 py-2.5">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-border flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about financials, metrics, cap table..."
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}
