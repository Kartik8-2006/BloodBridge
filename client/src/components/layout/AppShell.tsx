import { UserButton, useClerk } from '@clerk/clerk-react';
import { Bell, HelpCircle, Heart, LogOut, Menu, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useMe } from '../../hooks/useMe';
import { ChatWidget } from '../site/ChatWidget';
import { useRealtime } from '../../hooks/useRealtime';
import { bloodLabel } from '../../lib/blood';
import { NAV } from '../../lib/nav';
import type { Me } from '../../lib/types';
import { Logo, PageLoader } from '../ui/Misc';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;

function subtitle(me: Me): string {
  const { user, donor, hospital } = me;
  if (user.role === 'DONOR' && donor) return `${bloodLabel(donor.bloodGroup)} donor · ${donor.city}`;
  if (user.role === 'REQUESTER') return user.city ? `Requester · ${user.city}` : 'Requester';
  if (user.role === 'HOSPITAL') return hospital?.name ?? 'Hospital representative';
  if (user.role === 'ADMIN') return 'Administrator';
  return user.email;
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const { signOut } = useClerk();
  const role = me.user.role!;
  const nav = NAV[role];

  return (
    <div className="flex h-full flex-col bg-ink-100 px-4 pb-5 pt-5">
      <Link to="/" onClick={onNavigate} className="mb-6 block px-2 lg:hidden">
        <Logo />
      </Link>

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white bg-ink-50 p-3 shadow-card">
        {me.user.imageUrl ? (
          <img src={me.user.imageUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
            {me.user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink-900">{me.user.name}</p>
          <p className="truncate text-xs text-ink-500">{subtitle(me)}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {nav.items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
                        onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3.5 rounded-2xl px-4 py-3 text-[15px] font-semibold transition-all',
                isActive ? 'bg-brand-600 text-white shadow-glow' : 'text-ink-700 hover:bg-white hover:shadow-card',
              )
            }
          >
            <Icon className="size-5 shrink-0" />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 space-y-2 border-t border-ink-200 pt-4">
        <Link
          to={nav.cta.to}
          onClick={onNavigate}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-800 text-sm font-bold text-white shadow-card transition hover:bg-brand-900"
        >
          <Heart className="size-4 fill-white" /> {nav.cta.label}
        </Link>
        {SUPPORT_EMAIL && (
          <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-3.5 rounded-2xl px-4 py-2.5 text-[15px] font-semibold text-ink-700 hover:bg-white">
            <HelpCircle className="size-5" /> Support
          </a>
        )}
        <button
          onClick={() => signOut({ redirectUrl: '/' })}
          className="flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-4 py-2.5 text-[15px] font-semibold text-brand-700 hover:bg-white"
        >
          <LogOut className="size-5" /> Logout
        </button>
      </div>
    </div>
  );
}

function Topbar({ me, onMenu }: { me: Me; onMenu: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/app/hospitals${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-ink-200/70 bg-ink-100/90 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="cursor-pointer rounded-xl p-2 text-ink-700 hover:bg-white lg:hidden" aria-label="Open menu">
        <Menu className="size-6" />
      </button>
      <Link to="/" className="hidden w-[256px] shrink-0 lg:block">
        <Logo />
      </Link>

      {me.user.role !== 'HOSPITAL' ? (
      <form onSubmit={submit} className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search hospitals, blood banks, cities…"
          className="h-11 w-full rounded-2xl border border-ink-200 bg-white pl-11 pr-4 text-sm placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </form>
      ) : <div className="flex-1" />}

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <Link to="/app/dashboard" className="hidden rounded-xl px-2 py-1 text-sm font-semibold text-ink-600 hover:text-brand-700 md:block">
          Dashboard
        </Link>
        <Link to="/app/profile" className="hidden rounded-xl px-2 py-1 text-sm font-semibold text-ink-600 hover:text-brand-700 md:block">
          Profile
        </Link>
        <Link to="/app/notifications" className="relative rounded-xl p-2 text-ink-700 hover:bg-white" aria-label="Notifications">
          <Bell className="size-5" />
          {me.unreadNotifications > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-2.5 rounded-full bg-brand-600 ring-2 ring-ink-100" />
          )}
        </Link>
        <UserButton appearance={{ elements: { avatarBox: 'size-10' } }} />
      </div>
    </header>
  );
}

export function AppShell() {
  const { data: me, isLoading } = useMe();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((t: string) => setToast(t), []);
  useRealtime(!!me, showToast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  if (isLoading || !me) return <PageLoader />;

  return (
    <div className="min-h-full bg-ink-50">
      <Topbar me={me} onMenu={() => setOpen(true)} />

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[288px] shrink-0 border-r border-ink-200/70 lg:block">
          <Sidebar me={me} />
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] shadow-2xl">
              <button onClick={() => setOpen(false)} className="absolute right-3 top-3 z-10 cursor-pointer rounded-xl p-2 hover:bg-white" aria-label="Close menu">
                <X className="size-5" />
              </button>
              <Sidebar me={me} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main key={pathname} className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto max-w-6xl">
            <Outlet context={me} />
          </div>
        </main>
      </div>
      <ChatWidget />
      {toast && (
        <div role="status" aria-live="polite" className="no-print fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-ink-800 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
