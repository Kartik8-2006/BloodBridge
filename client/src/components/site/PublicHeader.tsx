import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { ChevronDown, Droplets, Menu, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Logo } from '../ui/Misc';

interface Item { to: string; label: string }
interface NavEntry { label: string; to?: string; items?: Item[] }

export const NAV: NavEntry[] = [
  { label: 'Find Blood', to: '/get-blood', items: [{ to: '/hospitals', label: 'Search hospitals' }, { to: '/get-blood', label: 'How to request blood' }, { to: '/get-blood#compatibility', label: 'Blood compatibility' }] },
  { label: 'Donate', to: '/donate', items: [{ to: '/donate', label: 'Become a donor' }, { to: '/camps', label: 'Donation camps' }, { to: '/donate#eligibility', label: 'Eligibility' }, { to: '/donate#process', label: 'Donation process' }] },
  { label: 'For Hospitals', to: '/for-hospitals', items: [{ to: '/for-hospitals', label: 'Join the network' }, { to: '/for-hospitals#verification', label: 'Verification' }, { to: '/hospitals', label: 'Hospital directory' }] },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Resources', to: '/resources', items: [{ to: '/resources', label: 'Resource hub' }, { to: '/get-blood#compatibility', label: 'Compatibility chart' }, { to: '/how-it-works#faq', label: 'FAQs' }, { to: '/verify', label: 'Verify a certificate' }] },
  { label: 'About', to: '/about', items: [{ to: '/about', label: 'Mission and vision' }, { to: '/about#safety', label: 'Safety and trust' }, { to: '/about#contact', label: 'Contact' }] },
];

function SearchBox({ onDone, className }: { onDone?: () => void; className?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/hospitals${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
    onDone?.();
  };
  return (
    <form onSubmit={submit} role="search" className={clsx('flex items-center rounded-full border border-ink-200 bg-white px-4', className)}>
      <Search className="size-4 shrink-0 text-ink-400" />
      <input autoFocus aria-label="Search hospitals and blood banks" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hospitals, blood banks, cities…" className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none" />
    </form>
  );
}

const SEARCH_SUGGESTIONS = [
  { label: 'Find a hospital or blood bank', keywords: 'hospital blood bank city location', to: '/hospitals' },
  { label: 'Request blood', keywords: 'request emergency patient need blood', to: '/get-blood' },
  { label: 'Become a blood donor', keywords: 'donate donation donor eligibility', to: '/donate' },
  { label: 'Blood compatibility chart', keywords: 'group compatibility a b o ab match', to: '/get-blood#compatibility' },
  { label: 'Donation camps', keywords: 'camp event drive', to: '/camps' },
  { label: 'Verify a donation certificate', keywords: 'verify certificate proof', to: '/verify' },
];

function SmartSearchBox({ onDone }: { onDone?: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const query = q.trim().toLowerCase();
  const suggestions = query ? SEARCH_SUGGESTIONS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(query)).slice(0, 4) : [];
  const go = (to: string) => { setActive(false); nav(to); onDone?.(); };
  const submit = (e: FormEvent) => { e.preventDefault(); go(`/hospitals${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };
  useEffect(() => {
    const dismiss = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setActive(false); };
    const dismissOnScroll = () => setActive(false);
    document.addEventListener('mousedown', dismiss);
    window.addEventListener('scroll', dismissOnScroll, true);
    return () => { document.removeEventListener('mousedown', dismiss); window.removeEventListener('scroll', dismissOnScroll, true); };
  }, []);
  return (
    <div ref={rootRef} className="bb-smart-search relative">
      <form onSubmit={submit} role="search" className="flex w-[19rem] items-center rounded-full border border-ink-300 bg-white px-4 shadow-[0_6px_20px_rgb(24_28_34_/_0.08)]">
        <input autoFocus aria-label="Search BloodBridge" value={q} onFocus={() => setActive(true)} onChange={(e) => { setQ(e.target.value); setActive(true); }} placeholder="Search BloodBridge..." className="h-11 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
        {q && <button type="button" onClick={() => { setQ(''); setActive(false); }} aria-label="Clear search" className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-brand-700"><X className="size-4" /></button>}
      </form>
      <div className={clsx('absolute right-0 top-[calc(100%+0.65rem)] w-[19rem] overflow-hidden rounded-2xl border border-ink-200 bg-white p-2 shadow-xl', (!query || !active) && 'hidden')}>
        <p className="px-3 pb-2 pt-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-400">{query ? 'Suggestions' : 'Popular searches'}</p>
        {suggestions.length ? suggestions.map((item) => <button key={item.label} type="button" onClick={() => go(item.to)} className="block w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink-700 transition hover:bg-brand-50 hover:text-brand-700">{item.label}</button>) : <button type="button" onClick={() => go(`/hospitals?q=${encodeURIComponent(q)}`)} className="block w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50">Search hospitals for “{q}”</button>}
      </div>
    </div>
  );
}

function Actions({ stacked }: { stacked?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold uppercase tracking-wider transition';
  return (
    <div className={clsx('flex gap-3', stacked && 'flex-col')}>
      <Link to="/hospitals" className={clsx(base, 'border-2 border-plasma-400 text-plasma-700 hover:bg-plasma-50')}><Search className="size-4" /> Find Blood</Link>
      <SignedOut>
        <Link to="/sign-up" className={clsx(base, 'bg-brand-600 text-white shadow-glow hover:bg-brand-700')}><Droplets className="size-4" /> Donate Blood</Link>
      </SignedOut>
      <SignedIn>
        <Link to="/app/dashboard" className={clsx(base, 'bg-brand-600 text-white shadow-glow hover:bg-brand-700')}>Dashboard</Link>
      </SignedIn>
    </div>
  );
}

export function PublicHeader() {
  const [drawer, setDrawer] = useState(false);
  const [openMobile, setOpenMobile] = useState<string | null>(null);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    setDrawer(false);
  }, [pathname, hash]);

  return (
    <header className="bg-white pt-[64px] shadow-[0_1px_0_0_theme(--color-ink-200)] xl:pt-[76px]">
      <div className="fixed inset-x-0 top-0 z-40 bg-white shadow-[0_1px_0_0_theme(--color-ink-200)]">
      <div className="mx-auto flex h-[64px] max-w-[112rem] items-center justify-between gap-5 px-5 sm:px-8 xl:h-[76px] xl:px-12">
        <Link to="/" aria-label="BloodBridge home" className="shrink-0"><Logo className="origin-left scale-95 sm:scale-100" /></Link>

        <div className="hidden flex-1 justify-center lg:flex"><SmartSearchBox /></div>

        <div className="hidden items-center gap-3 lg:flex">
          <SignedOut><Link to="/sign-in" className="mr-1 text-sm font-bold text-ink-700 transition hover:text-brand-700">Sign in</Link></SignedOut>
          <Actions />
        </div>

        <button type="button" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} aria-label="Menu" className="cursor-pointer rounded-xl p-2.5 text-ink-800 hover:bg-ink-100 lg:hidden">
          {drawer ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      </div>

      <nav aria-label="Main" className="hidden border-t border-ink-200 bg-white lg:block">
        <ul className="mx-auto flex h-[54px] max-w-[112rem] items-stretch justify-between px-8 xl:h-[60px] xl:px-12">
          {NAV.map((n) => (
            <li key={n.label} className="group relative flex items-center">
              {n.items ? (
                <>
                  <Link to={n.to!} aria-haspopup="true" className={clsx('flex items-center gap-1.5 rounded-xl px-4 py-2 text-[15px] font-semibold transition group-focus-within:bg-wine-900 group-focus-within:text-white group-hover:bg-wine-900 group-hover:text-white xl:text-base', pathname === n.to ? 'bg-brand-50 text-brand-700' : 'text-ink-600')}>
                    {n.label} <ChevronDown className="size-3.5" />
                  </Link>
                  <div className="invisible absolute top-full z-50 w-60 [li:nth-last-child(-n+2)>&]:right-0 [li:nth-last-child(n+3)>&]:left-0 pt-1 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <ul className="overflow-hidden rounded-2xl border border-ink-100 bg-white py-2 shadow-2xl">
                      {n.items.map((i) => (
                        <li key={i.label}><Link to={i.to} className="block px-5 py-3 text-[15px] text-ink-600 hover:bg-brand-50 hover:text-brand-700">{i.label}</Link></li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <Link to={n.to!} className={clsx('rounded-xl px-4 py-2 text-[15px] font-semibold transition hover:bg-wine-900 hover:text-white xl:text-base', pathname === n.to ? 'bg-brand-50 text-brand-700' : 'text-ink-600')}>{n.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {drawer && (
        <div className="rise-in max-h-[calc(100dvh-64px)] overflow-y-auto border-t border-ink-200 bg-white px-4 pb-8 pt-4 lg:hidden">
          <SearchBox onDone={() => setDrawer(false)} />
          <ul className="mt-3 divide-y divide-ink-100">
            {NAV.map((n) => (
              <li key={n.label}>
                {n.items ? (
                  <>
                    <div className="flex items-center justify-between gap-3 py-1">
                      <Link to={n.to!} className="flex-1 py-3 text-base font-semibold text-ink-800">{n.label}</Link>
                      <button type="button" aria-label={`Open ${n.label} menu`} aria-expanded={openMobile === n.label} onClick={() => setOpenMobile(openMobile === n.label ? null : n.label)} className="cursor-pointer rounded-lg p-3 text-ink-700 hover:bg-ink-100"><ChevronDown className={clsx('size-4 transition', openMobile === n.label && 'rotate-180')} /></button>
                    </div>
                    {openMobile === n.label && (
                      <ul className="mb-3 space-y-1 rounded-2xl bg-ink-50 p-2">
                        {n.items.map((i) => <li key={i.label}><Link to={i.to} className="block rounded-xl px-4 py-3 text-sm font-medium text-ink-700 hover:bg-white">{i.label}</Link></li>)}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link to={n.to!} className="block py-4 text-base font-semibold text-ink-800">{n.label}</Link>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-4">
            <Actions stacked />
            <SignedOut><Link to="/sign-in" className="block text-center text-sm font-bold text-ink-700">Already registered? Sign in</Link></SignedOut>
          </div>
        </div>
      )}
    </header>
  );
}
