import { useAuth } from '@clerk/clerk-react';
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const KEY = 'bb-prompt-dismissed';
const read = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
const write = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ } };

/** Vertical tab on the left edge and a gentle prompt after a while. Hidden for signed-in users. */
export function SiteFloaters() {
  const { isSignedIn } = useAuth();
  const { pathname } = useLocation();
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    if (isSignedIn || read()) return;
    const id = setTimeout(() => setPrompt(true), 15_000);
    return () => clearTimeout(id);
  }, [isSignedIn]);

  if (isSignedIn || pathname.startsWith('/sign-')) return null;
  return (
    <>
      <Link to="/sign-up" className="fixed left-0 top-[42%] z-30 hidden items-center gap-2 rounded-r-xl bg-plasma-600 py-5 pl-2 pr-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-brand-700 sm:flex [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180">
        <Heart className="size-4 rotate-90 fill-brand-600 text-brand-600" /> Join as a donor, it takes 2 minutes
      </Link>
      {prompt && (
        <div role="dialog" aria-label="Join as a donor" className="rise-in fixed bottom-24 right-4 z-30 flex w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-ink-200">
          <p className="flex flex-1 items-center gap-3 px-4 py-3 text-sm text-ink-700"><Heart className="size-5 shrink-0 fill-brand-500 text-brand-500" /> Ready to save a life? Join as a donor in 2 minutes.</p>
          <div className="flex w-28 shrink-0 flex-col divide-y divide-ink-100 border-l border-ink-100 text-center text-sm">
            <Link to="/sign-up" className="flex-1 px-3 py-3 font-bold text-ink-900 hover:bg-ink-50">I’m ready</Link>
            <button type="button" onClick={() => { write(); setPrompt(false); }} className="flex-1 cursor-pointer px-3 py-3 text-ink-600 hover:bg-ink-50">Not today</button>
          </div>
        </div>
      )}
    </>
  );
}
