import { useClerk } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Form';
import { Card, CardTitle, ErrorNote, PageHeader } from '../components/ui/Misc';
import { useMeContext } from '../App';
import { api } from '../lib/api';
import type { Prefs } from '../lib/types';

function Row({ title, body, checked, onChange, disabled }: { title: string; body: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-5 first:pt-0 last:pb-0">
      <div>
        <p className="font-bold text-ink-900">{title}</p>
        <p className="mt-0.5 text-sm text-ink-500">{body}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

export default function Settings() {
  const me = useMeContext();
  const qc = useQueryClient();
  const clerk = useClerk();
  const { prefs } = me.user;

  const save = useMutation({
    mutationFn: (patch: Partial<Prefs>) => api.patch('/users/me', { prefs: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Choose what we email you and manage how you sign in." />
      {save.isError && <div className="mb-5"><ErrorNote>{save.error instanceof Error ? save.error.message : 'Could not save your setting.'}</ErrorNote></div>}

      <Card>
        <CardTitle><span className="inline-flex items-center gap-3"><Bell className="size-5 text-ink-500" /> Notifications</span></CardTitle>
        <div className="divide-y divide-ink-100">
          <Row title="Email updates" body="Verification decisions, receipts and important account changes." checked={prefs.emailAlerts} onChange={(v) => save.mutate({ emailAlerts: v })} disabled={save.isPending} />
          <Row title="Community announcements" body="Urgent needs raised by hospitals and blood banks near you." checked={prefs.communityAnnouncements} onChange={(v) => save.mutate({ communityAnnouncements: v })} disabled={save.isPending} />
        </div>
      </Card>

      <Card className="mt-8">
        <CardTitle><span className="inline-flex items-center gap-3"><ShieldCheck className="size-5 text-ink-500" /> Account security</span></CardTitle>
        <p className="mb-5 text-ink-600">Change your email, password, connected accounts and active sessions.</p>
        <Button variant="outline" onClick={() => clerk.openUserProfile()}>Manage account and password</Button>
      </Card>
    </div>
  );
}
