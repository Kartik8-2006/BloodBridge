import { useMutation } from '@tanstack/react-query';
import { KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/Misc';
import { api } from '../../lib/api';
import { useState } from 'react';

interface Issued { code: string; codeExpiresAt: string }

/**
 * The code is only stored hashed on the server, so it can be shown right after accepting
 * or after asking for a fresh one. Asking again replaces the old code.
 */
export function CodePanel({ responseId, initial, onChange }: { responseId: string; initial?: Issued | null; onChange?: () => void }) {
  const [issued, setIssued] = useState<Issued | null>(initial ?? null);
  const fresh = useMutation({
    mutationFn: () => api.post<Issued>(`/responses/${responseId}/code`),
    onSuccess: (r) => { setIssued(r); onChange?.(); },
  });

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-brand-800"><KeyRound className="size-4" /> Your hospital code</p>
      {issued ? (
        <>
          <p aria-label={`Code ${issued.code.split('').join(' ')}`} className="mt-3 font-mono text-4xl font-extrabold tracking-[0.35em] text-ink-900">{issued.code}</p>
          <p className="mt-2 text-sm text-ink-600">Show this at the hospital desk. Valid until {new Date(issued.codeExpiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-600">For your safety the code is not stored in readable form. Tap below to show a fresh one.</p>
      )}
      {fresh.isError && <div className="mt-3"><ErrorNote>{fresh.error instanceof Error ? fresh.error.message : 'Could not get a code.'}</ErrorNote></div>}
      <Button className="mt-4" variant={issued ? 'outline' : 'primary'} size="sm" loading={fresh.isPending} icon={<RefreshCw className="size-4" />} onClick={() => fresh.mutate()}>
        {issued ? 'Get a new code' : 'Show my code'}
      </Button>
    </div>
  );
}
