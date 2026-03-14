import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AgentInfo, getChatUrl } from '@/lib/agents';
import { posthog } from '@/lib/posthog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentChatProps {
  agent: AgentInfo;
}

export default function AgentChat({ agent }: AgentChatProps) {
  const { session, orgId } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Load or create conversation
  useEffect(() => {
    if (!orgId) return;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', orgId)
          .eq('title', `${agent.department}-chat`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) { console.error('[AgentChat] Failed to load conversation:', error.message); return; }

        if (data) {
          setConversationId(data.id);
          const { data: msgs, error: msgsError } = await supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', data.id)
            .order('created_at', { ascending: true });
          if (msgsError) console.error('[AgentChat] Failed to load messages:', msgsError.message);
          if (msgs) setMessages(msgs as ChatMessage[]);
        }
      } catch (err) {
        console.error('[AgentChat] Load error:', err);
      }
    };
    load();
  }, [orgId, agent.department]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming || !session || !orgId) return;
    const userMsg = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const currentMessages = messagesRef.current;
    const newMessages = [...currentMessages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setIsStreaming(true);
    posthog.capture?.('agent_chat_sent', { agent_id: agent.id, agent_name: agent.name, department: agent.department, api_type: agent.apiType });

    // Ensure conversation exists
    let convId = conversationId;
    if (!convId) {
      const { data, error } = await supabase.from('conversations').insert({ organization_id: orgId, title: `${agent.department}-chat`, created_by: session.user.id }).select('id').single();
      if (error) console.error('[AgentChat] Failed to create conversation:', error.message);
      if (data) { convId = data.id; setConversationId(data.id); }
    }

    // Save user message
    if (convId) {
      const { error } = await supabase.from('messages').insert({ conversation_id: convId, role: 'user', content: userMsg });
      if (error) console.error('[AgentChat] Failed to save user message:', error.message);
    }

    // Build request body
    const url = getChatUrl(agent);

    if (!url.startsWith('http')) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Agent URL is not configured. Set VITE_AGENT_URL to connect to ${agent.name}.` }]);
      setIsStreaming(false);
      return;
    }

    const body = agent.apiType === 'A'
      ? { messages: newMessages.map(m => ({ role: m.role, content: m.content })), conversationId: convId }
      : { message: userMsg, organizationId: orgId, conversationId: convId, history: currentMessages };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Agent responded with ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                if (parsed.error) {
                  console.error('[AgentChat] SSE error payload:', parsed.error);
                  continue;
                }
                const chunk = parsed.choices?.[0]?.delta?.content || '';
                assistantContent += chunk;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: assistantContent };
                  return copy;
                });
              } catch (err) {
                console.warn('[AgentChat] SSE parse error:', payload, err);
              }
            }
          }
        }
      }

      // Save assistant message
      if (convId && assistantContent) {
        const { error } = await supabase.from('messages').insert({ conversation_id: convId, role: 'assistant', content: assistantContent });
        if (error) console.error('[AgentChat] Failed to save assistant message:', error.message);
      }
    } catch (err) {
      console.error('[AgentChat] Error:', err);
      setMessages(prev => {
        const copy = [...prev];
        const errMsg = `Sorry, I could not reach ${agent.name}. Please try again later.`;
        if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) {
          copy[copy.length - 1] = { role: 'assistant', content: errMsg };
        } else {
          copy.push({ role: 'assistant', content: errMsg });
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, session, orgId, conversationId, agent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className={cn('h-12 w-12 rounded-full flex items-center justify-center mb-3', agent.colorClass)}>
              <span className="text-lg font-bold text-white">{agent.name[0]}</span>
            </div>
            <p className="text-sm">Start a conversation with {agent.name}</p>
            <p className="text-xs mt-1">{agent.title}</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white', agent.colorClass)}>
                {agent.name[0]}
              </div>
            )}
            <div className={cn(
              'max-w-[75%] rounded-lg px-4 py-2.5 text-sm',
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
            )}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                  <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                </div>
              ) : msg.content}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white', agent.colorClass)}>
              {agent.name[0]}
            </div>
            <div className="flex items-center gap-1 px-4 py-2.5 bg-card border border-border rounded-lg">
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce-dot [animation-delay:-0.32s]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce-dot [animation-delay:-0.16s]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={`Message ${agent.name}...`}
            aria-label={`Message ${agent.name}`}
            className="flex-1 resize-none bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <Button size="icon" onClick={sendMessage} disabled={!input.trim() || isStreaming} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
