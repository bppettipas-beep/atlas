import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chat, PaperPlane, Plus, Users } from '@/components/icons';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { Avatar, Button, EmptyState, ErrorState, Input, Modal, Textarea, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { ChatMessageDto, ConversationDto, PersonSummary } from '@shared/types';

type ConversationResponse = { items: ConversationDto[] };
type MessagesResponse = { items: ChatMessageDto[] };

function chatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function nameFor(conversation: ConversationDto, membershipId: string) {
  if (conversation.kind === 'COMPANY') return 'Company chat';
  if (conversation.title) return conversation.title;
  return conversation.members
    .filter((member) => member.id !== membershipId)
    .map((member) => member.fullName)
    .join(', ') || 'Private chat';
}

export function ChatPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const loadConversations = useCallback(async (signal?: AbortSignal) => {
    const data = await api.get<ConversationResponse>('/chat/conversations', undefined, signal);
    const items = Array.isArray(data.items) ? data.items : [];
    setConversations(items);
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? null));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadConversations(controller.signal),
      api.get<{ items: PersonSummary[] }>('/people', undefined, controller.signal),
    ])
      .then(([, peopleData]) => setPeople(Array.isArray(peopleData.items) ? peopleData.items : []))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(errorMessage(caught));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [loadConversations]);

  // A new message is a small, isolated refresh: it reloads chat data only and
  // never remounts the route or touches the rest of the app shell.
  useRealtimeEvent(['chat:message', 'chat:conversation'], () => {
    void loadConversations().catch(() => undefined);
    if (!selectedId) return;
    void api
      .get<MessagesResponse>(`/chat/conversations/${selectedId}/messages`)
      .then((data) => setMessages(Array.isArray(data.items) ? data.items : []))
      .catch(() => undefined);
  });

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const controller = new AbortController();
    setMessagesLoading(true);
    api.get<MessagesResponse>(`/chat/conversations/${selectedId}/messages`, undefined, controller.signal)
      .then((data) => setMessages(Array.isArray(data.items) ? data.items : []))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(errorMessage(caught));
      })
      .finally(() => setMessagesLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  // Polling keeps conversations current without letting a socket event interrupt
  // an in-progress render. Sending still updates immediately below.
  useEffect(() => {
    const interval = window.setInterval(() => void loadConversations().catch(() => undefined), 12_000);
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const send = async () => {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    try {
      const response = await api.post<{ message: ChatMessageDto }>(`/chat/conversations/${selected.id}/messages`, { body: draft.trim() });
      setMessages((current) => [...current, response.message]);
      setConversations((current) => current.map((conversation) => conversation.id === selected.id ? { ...conversation, updatedAt: response.message.createdAt, lastMessage: { body: response.message.body, createdAt: response.message.createdAt, sender: response.message.sender } } : conversation));
      setDraft('');
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  if (!session) return null;

  return (
    <PageTransition>
      <PageBody className="flex max-w-none flex-col gap-4 space-y-0 py-4 sm:py-6">
        <div className="flex items-end justify-between gap-3">
          <div><p className="edge">Chat</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Company conversations</h1></div>
          <Button icon={<Plus />} onClick={() => setNewChatOpen(true)}>New message</Button>
        </div>
        {error && <ErrorState message={error} onRetry={() => { setError(null); setLoading(true); void loadConversations().finally(() => setLoading(false)); }} />}
        {!error && <div className="grid min-h-[590px] overflow-hidden border border-rule bg-sheet lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="border-b border-rule lg:border-b-0 lg:border-r">
            <p className="border-b border-rule px-4 py-3 edge">Conversations</p>
            <div className="flex max-h-[205px] overflow-x-auto lg:max-h-[540px] lg:flex-col lg:overflow-y-auto">
              {conversations.map((conversation) => {
                const name = nameFor(conversation, session.membership.id);
                const peer = conversation.members.find((member) => member.id !== session.membership.id);
                return <button type="button" key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={cn('min-w-[225px] border-b border-rule px-3 py-3 text-left hover:bg-paper lg:min-w-0', selectedId === conversation.id && 'bg-paper')}>
                  <div className="flex items-center gap-2.5">{conversation.kind === 'COMPANY' ? <span className="flex h-8 w-8 items-center justify-center bg-mark text-white"><Users /></span> : peer ? <Avatar name={peer.fullName} src={peer.avatarUrl} size="md" /> : <span className="flex h-8 w-8 items-center justify-center bg-paper"><Users /></span>}<div className="min-w-0"><p className="truncate text-[13px] font-medium text-ink">{name}</p><p className="mt-0.5 truncate text-[11px] text-ink-3">{conversation.lastMessage?.body || 'No messages yet'}</p></div></div>
                </button>;
              })}
              {!loading && conversations.length === 0 && <p className="p-4 text-[12px] text-ink-3">No conversations yet.</p>}
            </div>
          </aside>
          <section className="flex min-h-0 flex-col">
            {!selected && !loading && <EmptyState icon={<Chat />} title="Choose a conversation" description="Start with the company chat or a private message." />}
            {selected && <><div className="border-b border-rule px-4 py-3"><p className="text-[14px] font-medium text-ink">{nameFor(selected, session.membership.id)}</p><p className="mt-0.5 text-[11px] text-ink-3">{selected.kind === 'COMPANY' ? 'Everyone in the company' : `${selected.members.length} people`}</p></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper/30 p-4">{messagesLoading && <p className="text-[12px] text-ink-3">Loading messages…</p>}{messages.map((message) => { const mine = message.sender.id === session.membership.id; return <div key={message.id} className={cn('flex gap-2', mine && 'flex-row-reverse')}><Avatar name={message.sender.fullName} src={message.sender.avatarUrl} size="sm" /><div className={cn('max-w-[78%] px-3 py-2', mine ? 'bg-mark text-white' : 'border border-rule bg-sheet')}><p className={cn('mb-1 text-[10px]', mine ? 'text-white/70' : 'text-ink-3')}>{message.sender.fullName} · {chatTime(message.createdAt)}</p><p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.body}</p></div></div>; })}{!messagesLoading && messages.length === 0 && <p className="pt-16 text-center text-[13px] text-ink-3">No messages yet. Say hello.</p>}</div><div className="border-t border-rule p-3"><div className="flex gap-2"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Write a message" className="min-h-[42px] flex-1 resize-none py-2 text-[16px] sm:text-[13px]" /><Button size="icon" icon={<PaperPlane />} aria-label="Send" loading={sending} onClick={() => void send()} /></div></div></>}
          </section>
        </div>}
        <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} people={people} onCreated={(conversation) => { setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]); setSelectedId(conversation.id); setNewChatOpen(false); }} />
      </PageBody>
    </PageTransition>
  );
}

function NewChatModal({ open, onClose, people, onCreated }: { open: boolean; onClose: () => void; people: PersonSummary[]; onCreated: (conversation: ConversationDto) => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const choices = people.filter((person) => person.id !== session?.membership.id);
  const toggle = (id: string) => setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const create = async () => {
    if (!picked.length || (kind === 'GROUP' && (picked.length < 2 || !title.trim()))) return;
    setSaving(true);
    try {
      const result = kind === 'DIRECT' ? await api.post<{ conversation: ConversationDto }>('/chat/conversations', { kind, memberId: picked[0] }) : await api.post<{ conversation: ConversationDto }>('/chat/conversations', { kind, title: title.trim(), memberIds: picked });
      setPicked([]); setTitle(''); onCreated(result.conversation);
    } catch (caught) { toast.error(errorMessage(caught)); } finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title="New message"><div className="space-y-4"><div className="flex gap-2"><Button variant={kind === 'DIRECT' ? 'primary' : 'default'} onClick={() => { setKind('DIRECT'); setPicked([]); }}>Private</Button><Button variant={kind === 'GROUP' ? 'primary' : 'default'} onClick={() => { setKind('GROUP'); setPicked([]); }}>Group</Button></div>{kind === 'GROUP' && <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Group name" className="text-[16px] sm:text-[13px]" />}{kind === 'GROUP' && <p className="edge">Choose at least two people</p>}<div className="max-h-72 divide-y divide-rule overflow-y-auto border border-rule">{choices.map((person) => <button type="button" key={person.id} onClick={() => kind === 'DIRECT' ? setPicked([person.id]) : toggle(person.id)} className={cn('flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-paper', picked.includes(person.id) && 'bg-paper')}><Avatar name={person.fullName} src={person.avatarUrl} size="sm" /><span className="flex-1 text-[13px] text-ink">{person.fullName}</span>{picked.includes(person.id) && <span className="text-mark">✓</span>}</button>)}</div><div className="flex justify-end gap-2"><Button variant="default" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!picked.length || (kind === 'GROUP' && (!title.trim() || picked.length < 2))} onClick={() => void create()}>Start chat</Button></div></div></Modal>;
}
