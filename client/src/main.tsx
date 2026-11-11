import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ApiError, setTokenGetter } from './lib/api';
import './index.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

/** Hands Clerk's session token to the API client. Set during render so child queries never fire without it. */
function ApiBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  setTokenGetter(() => getToken());
  return children;
}

function Providers({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={clerkKey!}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignOutUrl="/"
    >
      <ApiBridge>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiBridge>
    </ClerkProvider>
  );
}

function MissingKey() {
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-extrabold text-ink-900">Clerk key is missing</h1>
      <p className="text-ink-600">
        Copy <code className="rounded bg-ink-100 px-1.5 py-0.5">client/.env.example</code> to <code className="rounded bg-ink-100 px-1.5 py-0.5">client/.env</code>, paste your
        Clerk publishable key as <code className="rounded bg-ink-100 px-1.5 py-0.5">VITE_CLERK_PUBLISHABLE_KEY</code>, then restart <code className="rounded bg-ink-100 px-1.5 py-0.5">npm run dev</code>.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    {clerkKey ? (
      <BrowserRouter>
        <Providers>
          <App />
        </Providers>
      </BrowserRouter>
    ) : (
      <MissingKey />
    )}
    </ErrorBoundary>
  </StrictMode>,
);

// Installable app + offline shell. Production only, so development hot reload is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
