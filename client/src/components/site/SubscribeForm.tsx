import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../../lib/api';

export function SubscribeForm() {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const sub = useMutation({
    mutationFn: () => api.post('/public/subscribe', { email, name: name || undefined, city: city || undefined }),
    onError: (e) => setError(e instanceof ApiError ? (e.fields?.email ?? e.message) : 'Something went wrong. Please try again.'),
  });

  if (sub.isSuccess) {
    return (
      <div role="status" className="mx-auto flex max-w-xl items-center justify-center gap-3 rounded-full bg-white px-6 py-5 text-base font-bold text-emerald-700">
        <CheckCircle2 className="size-6 shrink-0" /> You are on the list. Thank you!
      </div>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Enter your email address');
    sub.mutate();
  };
  const field = 'h-14 w-full rounded-full border-0 bg-white px-6 text-base text-ink-800 placeholder:text-ink-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50';
  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Your name" className={field} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        <input aria-label="Your city" className={field} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" />
      </div>
      <div className="flex rounded-full bg-white p-1.5 focus-within:ring-4 focus-within:ring-white/50">
        <input aria-label="Email address" type="email" className="h-12 min-w-0 flex-1 rounded-full border-0 bg-transparent px-5 text-base text-ink-800 placeholder:text-ink-300 focus:outline-none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <button type="submit" disabled={sub.isPending} className="cursor-pointer rounded-full bg-wine-900 px-6 text-sm font-extrabold uppercase tracking-wider text-white transition hover:bg-black disabled:opacity-60 sm:px-8">
          {sub.isPending ? 'Sending' : 'Subscribe'}
        </button>
      </div>
      {error && <p role="alert" className="text-center text-sm font-semibold text-white">{error}</p>}
    </form>
  );
}
