import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, PaperPlane, Warning, X } from '@/components/icons';
import { Button, DRAFT_EASE, Spinner, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ToolTrace {
  name: string;
  ok: boolean;
  summary: string;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  actions?: ToolTrace[];
}

const OPENERS = [
  'Create a task for whoever is free tomorrow',
  'What is overdue right now?',
  'Add a Dispatcher role and give it to Rosa',
];

/**
 * Shortcuts, not a command language.
 *
 * Every one of these is a sentence you could have typed yourself — the slash
 * only saves the typing. Most drop a half-written line into the box for you to
 * finish, because the interesting part is the bit only you know.
 */
interface SlashCommand {
  name: string;
  hint: string;
  /** Dropped into the box for the user to complete. */
  insert?: string;
  /** Sent immediately — nothing more is needed. */
  send?: string;
  /** Handled here rather than by the model. */
  local?: 'clear';
}

const COMMANDS: SlashCommand[] = [
  { name: 'task', hint: 'Create a task', insert: 'Create a task to ' },
  { name: 'assign', hint: 'Assign work to someone', insert: 'Assign  to ' },
  { name: 'role', hint: 'Create a role', insert: 'Create a role called ' },
  { name: 'fire', hint: 'Remove someone from the company', insert: 'Remove  from the company' },
  { name: 'overdue', hint: 'What is late', send: 'What is overdue right now?' },
  { name: 'who', hint: 'Who works here', send: 'Who works here, and what do they do?' },
  { name: 'help', hint: 'What Atlasy can do', send: 'What can you do?' },
  { name: 'clear', hint: 'Forget this conversation', local: 'clear' },
];

/** Whether this instance has an assistant configured. Null while unknown. */
export function useAssistantEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ enabled: boolean }>('/assistant/config')
      .then((config) => !cancelled && setEnabled(config.enabled))
      .catch(() => !cancelled && setEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}

/**
 * Atlasy, in a side panel.
 *
 * Deliberately not a floating bubble over the content: this is a colleague you
 * turn to, so it takes its own column and pushes nothing out of the way.
 */
export function AtlasyPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The menu is open while the box holds a single unfinished /word. Once a
  // space is typed the person is writing a sentence, not picking a command.
  const slashQuery = /^\/\S*$/.test(input) ? input.slice(1).toLowerCase() : null;
  const matches =
    slashQuery === null ? [] : COMMANDS.filter((command) => command.name.startsWith(slashQuery));
  const menuOpen = matches.length > 0;

  const runCommand = (command: SlashCommand) => {
    if (command.local === 'clear') {
      setTurns([]);
      setInput('');
      setError(null);
      return;
    }
    if (command.send) {
      setInput('');
      void send(command.send);
      return;
    }
    setInput(command.insert ?? '');
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  useEffect(() => {
    setCommandIndex(0);
  }, [slashQuery]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    const next: Turn[] = [...turns, { role: 'user', content: question }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const result = await api.post<{ reply: string; actions: ToolTrace[] }>('/assistant/chat', {
        // Keep the payload within the API limit as the panel grows. The model
        // only needs the most recent context to continue the conversation.
        messages: next.slice(-40).map((turn) => ({ role: turn.role, content: turn.content })),
      });
      setTurns([...next, { role: 'assistant', content: result.reply, actions: result.actions }]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.28, ease: DRAFT_EASE }}
          className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[400px] flex-col border-l border-edge bg-sheet shadow-lift"
          aria-label="Atlasy assistant"
        >
          {/* ---------------------------- title block --------------------------- */}
          <header className="flex shrink-0 items-center justify-between border-b border-rule px-4 py-3">
            <span className="inline-flex items-center gap-2">
              <span className="title text-[14px] leading-none">Atlasy</span>
              <span className="edge-sm whitespace-nowrap border border-edge px-1 py-px text-ink-4">
                Beta
              </span>
            </span>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Atlasy">
              <X className="text-[14px]" />
            </Button>
          </header>

          {/* ------------------------------- thread ----------------------------- */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <div className="pt-4">
                <p className="text-[13.5px] leading-relaxed text-ink-2">
                  Ask for anything you could do yourself — Atlasy works with your permissions, not
                  its own.
                </p>
                <ul className="mt-5 space-y-2">
                  {OPENERS.map((opener) => (
                    <li key={opener}>
                      <button
                        type="button"
                        onClick={() => void send(opener)}
                        className="w-full border border-edge bg-paper px-3 py-2.5 text-left text-[13px] leading-snug text-ink-2 transition-colors hover:border-edgeStrong hover:text-ink"
                      >
                        {opener}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4">
              {turns.map((turn, index) => (
                <div key={index}>
                  {turn.role === 'user' ? (
                    <div className="ml-6 border-l-2 border-ink bg-paper px-3 py-2">
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                        {turn.content}
                      </p>
                    </div>
                  ) : (
                    <div>
                      {/* What it actually did, before what it says about it. */}
                      {turn.actions && turn.actions.length > 0 && (
                        <ul className="mb-2 space-y-1">
                          {turn.actions.map((action, actionIndex) => (
                            <li
                              key={actionIndex}
                              className="flex items-start gap-2 text-[12px] leading-snug"
                            >
                              {action.ok ? (
                                <Check className="mt-[3px] shrink-0 text-[11px] text-done" />
                              ) : (
                                <Warning className="mt-[3px] shrink-0 text-[11px] text-alert" />
                              )}
                              <span className={action.ok ? 'text-ink-3' : 'text-alert'}>
                                {action.summary}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">
                        {turn.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
                  <Spinner className="text-[13px]" />
                  Working on it…
                </div>
              )}

              {error && (
                <p className="border border-alert bg-alert-wash px-3 py-2 text-[12.5px] leading-snug text-alert">
                  {error}
                </p>
              )}
            </div>

            <div ref={endRef} />
          </div>

          {/* ----------------------------- composer ----------------------------- */}
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void send(input);
            }}
            className="relative shrink-0 border-t border-rule p-3"
          >
            {menuOpen && (
              <ul
                role="listbox"
                aria-label="Commands"
                className="absolute bottom-full left-3 right-3 z-10 mb-2 max-h-64 overflow-y-auto border border-edge bg-sheet py-1 shadow-lift"
              >
                {matches.map((command, index) => (
                  <li key={command.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === commandIndex}
                      onMouseEnter={() => setCommandIndex(index)}
                      // Mousedown, not click: the textarea blurring first would
                      // close the menu before the click ever landed.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runCommand(command);
                      }}
                      className={cn(
                        'flex w-full items-baseline gap-2.5 px-3 py-1.5 text-left transition-colors',
                        index === commandIndex ? 'bg-paper' : 'hover:bg-paper',
                      )}
                    >
                      <span className="font-mono text-[12.5px] text-ink">/{command.name}</span>
                      <span className="truncate text-[12px] text-ink-3">{command.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Textarea
              ref={inputRef}
              rows={2}
              value={input}
              disabled={busy}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // While the command menu is up it owns the keys that move
                // through it, so Enter picks a command rather than sending "/t".
                if (menuOpen) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCommandIndex((index) => (index + 1) % matches.length);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCommandIndex((index) => (index - 1 + matches.length) % matches.length);
                    return;
                  }
                  if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault();
                    runCommand(matches[commandIndex]);
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setInput('');
                    return;
                  }
                }

                // Enter sends; Shift+Enter writes a new line. This is a chat box,
                // not a document.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask Atlasy to do something, or type /"
              aria-label="Message Atlasy"
              className="resize-none text-[13.5px]"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="edge-sm text-ink-4">
                {menuOpen ? 'Tab to pick' : 'Enter to send · / for commands'}
              </span>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                icon={<PaperPlane />}
                loading={busy}
                disabled={!input.trim()}
              >
                Send
              </Button>
            </div>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** The button that opens the panel. Lives in the app's top bar. */
export function AtlasyButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-sm border px-2.5 text-[12.5px] font-medium',
        'transition-colors duration-150 ease-draft',
        open
          ? 'border-ink bg-ink text-white'
          : 'border-edge bg-sheet text-ink hover:border-edgeStrong hover:bg-paper',
      )}
    >
      Atlasy
    </button>
  );
}
