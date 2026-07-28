import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Chat, PaperPlane, Plus, Users } from '@/components/icons';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { Avatar, Button, EmptyState, ErrorState, Input, Modal, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { ChatMessageDto, ConversationDto, PersonSummary } from '@shared/types';

function conversationName(conversation: ConversationDto, me: string) {
  if (conversation.kind === 'COMPANY') return 'Company chat';
  if (conversation.title) return conversation.title;
  return conversation.members.filter((member) => member.id !== me).map((member) => member.fullName).join(', ');
}

export function ChatPage() {
  return <ChatErrorBoundary><ChatWorkspace /></ChatErrorBoundary>;
}

/**
 * A live message must never be able to take down the whole application. This
 * is intentionally local to chat: a bad message payload can be recovered by
 * remounting this workspace without disrupting the rest of Atlas.
 */
class ChatErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Chat workspace failed to render:', error, info);
  }

  render() {
    if (this.state.failed) {
      return <PageTransition><PageBody><EmptyState icon={<Chat />} title="Chat needs a quick refresh" description="Your message may have sent, but this conversation did not reload cleanly." action={<Button onClick={() => this.setState({ failed: false })}>Reload chat</Button>} /></PageBody></PageTransition>;
    }
    return this.props.children;
  }
}

function ChatWorkspace() {
  const { session } = useAuth();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const conversations = useQuery<{ items: ConversationDto[] }>((signal) => api.get('/chat/conversations', undefined, signal), []);
  const people = useQuery<{ items: PersonSummary[] }>((signal) => api.get('/people', undefined, signal), []);

  const selected = useMemo(
    () => conversations.data?.items.find((conversation) => conversation.id === selectedId) ?? conversations.data?.items[0] ?? null,
    [conversations.data, selectedId],
  );
  const messages = useQuery<{ items: ChatMessageDto[] }>(
    (signal) => (selected ? api.get(`/chat/conversations/${selected.id}/messages`, undefined, signal) : Promise.resolve({ items: [] })),
    [selected?.id],
  );

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages.data?.items.length, selected?.id]);
  useRealtimeEvent(['chat:conversation', 'chat:message'], () => {
    conversations.refetch();
    messages.refetch();
  });

  // The route is guarded above, but this prevents a transient auth refresh
  // from turning an in-flight chat update into a render exception.
  if (!session) return null;

  const send = async () => {
    if (!selected || !body.trim()) return;
    setSending(true);
    try {
      await api.post(`/chat/conversations/${selected.id}/messages`, { body: body.trim() });
      setBody('');
      messages.refetch();
      conversations.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageTransition>
      <PageBody className="flex max-w-none flex-col gap-4 space-y-0 py-4 sm:py-6">
        <div className="flex shrink-0 items-end justify-between gap-3">
          <div>
            <p className="edge">Chat</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Keep the company moving</h1>
          </div>
          <Button icon={<Plus />} onClick={() => setComposeOpen(true)}>New message</Button>
        </div>

        <div className="grid min-h-[620px] flex-1 overflow-hidden border border-rule bg-sheet lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-rule lg:border-b-0 lg:border-r">
            <div className="border-b border-rule px-4 py-3"><p className="edge">Conversations</p></div>
            <div className="flex max-h-[210px] overflow-x-auto lg:max-h-none lg:flex-col lg:overflow-y-auto">
              {(conversations.data?.items ?? []).map((conversation) => {
                const name = conversationName(conversation, session.membership.id);
                const peer = conversation.members.find((member) => member.id !== session.membership.id);
                return <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={cn('min-w-[210px] border-b border-rule px-3 py-3 text-left transition-colors lg:min-w-0', selected?.id === conversation.id ? 'bg-paper' : 'hover:bg-paper/60')}>
                  <div className="flex items-center gap-2.5">
                    {conversation.kind === 'COMPANY' ? <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-mark text-white"><Users /></span> : peer ? <Avatar name={peer.fullName} src={peer.avatarUrl} size="md" /> : <span className="flex h-8 w-8 items-center justify-center bg-paper"><Users /></span>}
                    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-[13px] font-medium text-ink">{name}</p><span className="shrink-0 text-[10px] text-ink-3">{relativeTime(conversation.updatedAt)}</span></div><p className="mt-0.5 truncate text-[12px] text-ink-3">{conversation.lastMessage ? `${conversation.lastMessage.sender.fullName}: ${conversation.lastMessage.body}` : 'No messages yet'}</p></div>
                  </div>
                </button>;
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            {conversations.error && <ErrorState message={conversations.error} onRetry={conversations.refetch} />}
            {!selected && !conversations.loading && <EmptyState icon={<Chat />} title="Start a conversation" description="Use the company chat or create a private message." action={<Button onClick={() => setComposeOpen(true)}>New message</Button>} />}
            {selected && <>
              <div className="flex items-center gap-2 border-b border-rule px-4 py-3"><Chat className="text-ink-3" /><div><p className="text-[14px] font-medium text-ink">{conversationName(selected, session.membership.id)}</p><p className="text-[11px] text-ink-3">{selected.kind === 'COMPANY' ? 'Everyone in the company' : `${selected.members.length} people`}</p></div></div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-paper/30 p-4">
                {messages.error && <ErrorState message={messages.error} onRetry={messages.refetch} />}
                {(messages.data?.items ?? []).map((message) => {
                  const mine = message.sender.id === session.membership.id;
                  return <div key={message.id} className={cn('flex max-w-[80%] gap-2', mine ? 'ml-auto flex-row-reverse' : '')}><Avatar name={message.sender.fullName} src={message.sender.avatarUrl} size="sm" /><div className={cn('min-w-0 px-3 py-2', mine ? 'bg-mark text-white' : 'border border-rule bg-sheet text-ink')}><p className={cn('mb-1 text-[10px]', mine ? 'text-white/70' : 'text-ink-3')}>{message.sender.fullName} · {relativeTime(message.createdAt)}</p><p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.body}</p></div></div>;
                })}
                {messages.data?.items.length === 0 && !messages.loading && <p className="pt-16 text-center text-[13px] text-ink-3">No messages yet. Say hello.</p>}
                <div ref={bottom} />
              </div>
              <div className="border-t border-rule bg-sheet p-3"><div className="flex gap-2"><Textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Write a message…" className="min-h-[42px] flex-1 resize-none py-2" /><Button size="icon" icon={<PaperPlane />} aria-label="Send message" loading={sending} onClick={() => void send()} /></div><p className="mt-1 text-[10px] text-ink-3">Enter to send · Shift + Enter for a new line</p></div>
            </>}
          </section>
        </div>
        <NewConversationModal open={composeOpen} onClose={() => setComposeOpen(false)} people={people.data?.items ?? []} onCreated={(id) => { setSelectedId(id); setComposeOpen(false); conversations.refetch(); }} />
      </PageBody>
    </PageTransition>
  );
}

function NewConversationModal({ open, onClose, people, onCreated }: { open: boolean; onClose: () => void; people: PersonSummary[]; onCreated: (id: string) => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const choices = people.filter((person) => person.id !== session?.membership.id);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const create = async () => {
    if (!selected.length || (mode === 'GROUP' && (!title.trim() || selected.length < 2))) return;
    setSaving(true);
    try {
      const data = mode === 'DIRECT' ? await api.post<{ conversation: ConversationDto }>('/chat/conversations', { kind: mode, memberId: selected[0] }) : await api.post<{ conversation: ConversationDto }>('/chat/conversations', { kind: mode, title: title.trim(), memberIds: selected });
      setSelected([]); setTitle(''); onCreated(data.conversation.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create that conversation.'); } finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title="New message"><div className="space-y-4"><div className="flex gap-2"><Button variant={mode === 'DIRECT' ? 'primary' : 'default'} onClick={() => { setMode('DIRECT'); setSelected([]); }}>Private message</Button><Button variant={mode === 'GROUP' ? 'primary' : 'default'} onClick={() => { setMode('GROUP'); setSelected([]); }}>Group message</Button></div>{mode === 'GROUP' && <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Group name" />}{mode === 'GROUP' && <p className="edge">Choose at least two people</p>}<div className="max-h-72 divide-y divide-rule overflow-y-auto border border-rule">{choices.map((person) => <button key={person.id} onClick={() => mode === 'DIRECT' ? setSelected([person.id]) : toggle(person.id)} className={cn('flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-paper', selected.includes(person.id) && 'bg-paper')}><Avatar name={person.fullName} src={person.avatarUrl} size="sm" /><span className="flex-1 text-[13px] text-ink">{person.fullName}</span>{selected.includes(person.id) && <span className="text-mark">✓</span>}</button>)}</div><div className="flex justify-end gap-2"><Button variant="default" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!selected.length || (mode === 'GROUP' && (!title.trim() || selected.length < 2))} onClick={() => void create()}>Start chat</Button></div></div></Modal>;
}
