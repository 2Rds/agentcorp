import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AgentInfo, getChatUrl } from '@/lib/agents';
import { posthog } from '@/lib/posthog';
import { getDeptTheme } from '@/lib/department-theme';
import { ChatMessage } from './ChatMessage';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

let msgCounter = 0;
function nextMsgId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

interface AgentChatProps {
  agent: AgentInfo;
}

export default function AgentChat({ agent }: AgentChatProps) {
  const { session, orgId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Load or create conversation
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('title', `${agent.department}-chat`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('[AgentChat] Failed to load conversation:', error.message);
        return;
      }

      if (data) {
        setConversationId(data.id);
        const { data: msgs, error: msgsError } = await supabase
          .from('messages')
          .select('role, content')
          .eq('conversation_id', data.id)
          .order('created_at', { ascending: true });

        if (cancelled) return;
        if (msgsError) {
          console.error('[AgentChat] Failed to load messages:', msgsError.message);
          return;
        }
        if (msgs) {
          setMessages(msgs.map(m => ({ id: nextMsgId(), role: m.role as 'user' | 'assistant', content: m.content })));
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orgId, agent.department]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming || !session || !orgId) return;
    const userMsg = input.trim();
    setInput('');

    const userMsgObj: Message = { id: nextMsgId(), role: 'user', content: userMsg };
    setMessages(prev => [...prev, userMsgObj]);
    setIsStreaming(true);

    let convId = conversationId;
    if (!convId) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ organization_id: orgId, title: `${agent.department}-chat`, created_by: session.user.id })
        .select('id')
        .single();
      if (error) {
        console.error('[AgentChat] Failed to create conversation:', error.message);
      }
      if (data) {
        convId = data.id;
        setConversationId(data.id);
      }
    }

    if (convId) {
      const { error } = await supabase.from('messages').insert({ conversation_id: convId, role: 'user', content: userMsg });
      if (error) console.error('[AgentChat] Failed to persist user message:', error.message);
    }

    const currentMessages = messagesRef.current;
    const apiMessages = currentMessages.map(m => ({ role: m.role, content: m.content }));
    const url = getChatUrl(agent);
    const body = agent.apiType === 'A'
      ? { messages: apiMessages, conversationId: convId }
      : { message: userMsg, organizationId: orgId, conversationId: convId, history: apiMessages.slice(0, -1) };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 401) throw new Error('Your session has expired. Please sign in again.');
        if (status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
        throw new Error(`Agent responded with ${status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMsgId = nextMsgId();

      setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

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
                const chunk = parsed.choices?.[0]?.delta?.content || '';
                assistantContent += chunk;
                setMessages(prev =>
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
                );
              } catch (err) {
                if (err instanceof SyntaxError) {
                  console.warn('[AgentChat] Unparseable SSE chunk:', payload.slice(0, 100));
                } else {
                  console.error('[AgentChat] Error processing stream chunk:', err);
                }
              }
            }
          }
        }
      } else {
        // res.body is null — mark as error instead of ghost message
        assistantContent = 'Unable to read response stream. Please try again.';
        setMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
        );
      }

      if (convId && assistantContent) {
        const { error } = await supabase.from('messages').insert({ conversation_id: convId, role: 'assistant', content: assistantContent });
        if (error) console.error('[AgentChat] Failed to persist assistant message:', error.message);
      }
    } catch (err) {
      console.error('[AgentChat] Stream failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Sorry, I could not reach the agent. Please try again later.';
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: errorMessage } : m);
        }
        return [...prev, { id: nextMsgId(), role: 'assistant', content: errorMessage }];
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, session, orgId, conversationId, agent]);

  const theme = getDeptTheme(agent.department);

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming ? (
          <ChatEmptyState agent={agent} onSelectPrompt={handleSelectPrompt} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                agent={agent}
                index={i}
                isLast={i === messages.length - 1}
              />
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-3">
                <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white', theme.bg)}>
                  {agent.name[0]}
                </div>
                <div className="flex items-center gap-1 px-4 py-2.5 glass-card rounded-xl">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce-dot [animation-delay:-0.32s]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce-dot [animation-delay:-0.16s]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce-dot" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput
        agent={agent}
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        isStreaming={isStreaming}
      />
    </div>
  );
}
