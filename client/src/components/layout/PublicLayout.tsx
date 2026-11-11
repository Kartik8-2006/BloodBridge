import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ChatWidget } from '../site/ChatWidget';
import { PublicFooter } from '../site/PublicFooter';
import { PublicHeader } from '../site/PublicHeader';

/** Scrolls to the #anchor of the new URL, or to the top on a normal page change. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

export function PublicLayout() {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <ScrollManager />
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
      <ChatWidget />
    </div>
  );
}

/** Narrow content wrapper for the functional public pages (directory, verification). */
export function ContentLayout() {
  return (
    <div className="mx-auto w-full max-w-6xl bg-ink-50 px-4 py-10 sm:px-6">
      <Outlet />
    </div>
  );
}
