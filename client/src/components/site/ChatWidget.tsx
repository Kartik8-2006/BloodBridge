import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { ArrowUpRight, MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../lib/api';

interface GuideLink { label: string; to: string }
interface Msg { role: 'user' | 'assistant'; content: string; links?: GuideLink[] }
interface Status { available: boolean; chat: boolean; audience: string; suggestions: string[] }

const GREETING: Record<string, string> = {
  PUBLIC: 'Hi! Ask me anything about BloodBridge: how to donate, how to request blood, or how your hospital can join.',
  DONOR: 'Hi! I can help with requests for you, the 6 digit code, certificates, camps and your eligibility.',
  REQUESTER: 'Hi! I can walk you through requesting blood, tracking donors and what to do if help is slow.',
  HOSPITAL: 'Hi! I can help with verification, calling donors, desk code checks, inventory, camps and billing.',
  ADMIN: 'Hi! I can point you to verifications, users, fraud review, the audit log and revenue.',
};

/** Gemini sometimes sends markdown. The bubble is plain text, so tidy the common bits. */
const tidy = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[*-]\s+/gm, '• ').replace(/^#+\s*/gm, '');

/** Floating assistant. It knows who is asking (donor, requester, hospital, admin) and where they are, and works from the site guide even without an AI key. */
export function ChatWidget() {
  const { userId, isLoaded } = useAuth();
  const { pathname } = useLocation();
  const status = useQuery({ queryKey: ['ai-status', userId ?? 'public'], queryFn: () => api.get<Status>('/ai/status'), staleTime: 10 * 60_000, retry: false, enabled: isLoaded });
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (history: Msg[]) => api.post<{ reply: string; links?: GuideLink[] }>('/ai/chat', { messages: history.slice(-10).map(({ role, content }) => ({ role, content })), page: pathname.slice(0, 120) }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: 'assistant', content: tidy(r.reply), links: r.links }]),
    onError: (e) => setMsgs((m) => [...m, { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong. Please try again.' }]),
  });

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, ask.isPending]);

  // A different account on the same browser starts a fresh conversation.
  useEffect(() => { setMsgs([]); }, [userId]);

  if (!status.data?.chat) return null;

  const send = (content: string) => {
    const clean = content.trim().slice(0, 1000);
    if (!clean || ask.isPending) return;
    const next = [...msgs, { role: 'user' as const, content: clean }];
    setMsgs(next);
    setText('');
    ask.mutate(next);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask the BloodBridge assistant" className="no-print fixed bottom-4 right-4 z-40 flex h-14 cursor-pointer items-center gap-2 rounded-full bg-brand-600 pl-4 pr-5 text-sm font-bold text-white shadow-glow transition hover:bg-brand-700">
          <MessageCircle className="size-5" /> <span className="hidden sm:inline">Ask us</span>
        </button>
      )}
      {open && (
        <section role="dialog" aria-label="BloodBridge assistant" className="no-print rise-in fixed inset-x-2 bottom-2 z-50 flex max-h-[min(36rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl ring-1 ring-ink-200 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[24rem]">
          <header className="flex items-center justify-between bg-gradient-to-r from-brand-700 to-wine-900 px-5 py-4 text-white">
            <div>
              <p className="font-extrabold">BloodBridge Assistant</p>
              <p className="text-xs text-brand-100">{status.data.available ? 'AI assistant. Not medical advice.' : 'Site guide. Not medical advice.'}</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant" className="cursor-pointer rounded-full p-1.5 hover:bg-white/15"><X className="size-5" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-ink-50 p-4" aria-live="polite">
            {msgs.length === 0 && (
              <div>
                <p className="text-sm text-ink-600">{GREETING[status.data.audience] ?? GREETING.PUBLIC}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {status.data.suggestions.map((s) => <button key={s} onClick={() => send(s)} className="cursor-pointer rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">{s}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={clsx('max-w-[88%]', m.role === 'user' && 'ml-auto')}>
                <div className={clsx('whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white text-ink-800 shadow-card')}>{m.content}</div>
                {m.links && m.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.links.map((l) => (
                      <Link key={l.to} to={l.to} onClick={() => { if (window.innerWidth < 640) setOpen(false); }} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
                        {l.label} <ArrowUpRight className="size-3.5" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {ask.isPending && <div className="w-16 rounded-2xl bg-white px-4 py-2.5 text-sm text-ink-400 shadow-card">…</div>}
            <div ref={end} />
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-ink-100 bg-white p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Your question" placeholder="Type your question" className="h-11 min-w-0 flex-1 rounded-full border border-ink-200 bg-ink-50 px-4 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100" />
            <button type="submit" disabled={ask.isPending || !text.trim()} aria-label="Send" className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-50"><Send className="size-4" /></button>
          </form>
        </section>
      )}
    </>
  );
}
