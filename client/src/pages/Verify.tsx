import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ShieldX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Form';
import { Card, PageLoader } from '../components/ui/Misc';
import { api } from '../lib/api';
import { bloodLabel } from '../lib/blood';
import { formatDate } from '../lib/format';
import type { CertificateCheck } from '../lib/types';

/** Public page: anyone can confirm a certificate number is genuine. */
export default function Verify() {
  const { no } = useParams();
  const nav = useNavigate();
  const [value, setValue] = useState(no ?? '');
  const q = useQuery({ queryKey: ['verify', no], queryFn: () => api.get<CertificateCheck>(`/public/certificates/${encodeURIComponent(no!)}`), enabled: !!no, retry: false });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) nav(`/verify/${value.trim().toUpperCase()}`);
  };

  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Verify a certificate</h1>
      <p className="mt-2 text-ink-600">Enter the certificate number printed on a BloodBridge donation certificate.</p>
      <form onSubmit={submit} className="mt-6 flex gap-3">
        <Input aria-label="Certificate number" className="h-12 font-mono uppercase" placeholder="BB-2026-XXXX-XXXX" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" size="lg">Check</Button>
      </form>
      {no && q.isLoading && <PageLoader />}
      {q.isError && (
        <Card className="mt-6 flex items-start gap-3 border-brand-200 bg-brand-50">
          <ShieldX className="mt-0.5 size-6 shrink-0 text-brand-700" />
          <div><p className="font-bold text-brand-800">No certificate found</p><p className="text-sm text-ink-600">Check the number and try again. This certificate may not be genuine.</p></div>
        </Card>
      )}
      {q.data && (
        <Card className="mt-6">
          <p className="flex items-center gap-2 font-bold text-emerald-700"><BadgeCheck className="size-6" /> Genuine certificate</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-ink-500">Donor</dt><dd className="font-bold text-ink-900">{q.data.donor}</dd></div>
            <div><dt className="text-ink-500">Blood group</dt><dd className="font-bold text-ink-900">{bloodLabel(q.data.bloodGroup)}</dd></div>
            <div><dt className="text-ink-500">Date</dt><dd className="font-bold text-ink-900">{formatDate(q.data.donatedAt)}</dd></div>
            <div><dt className="text-ink-500">Hospital</dt><dd className="font-bold text-ink-900">{q.data.hospital}{q.data.city ? `, ${q.data.city}` : ''}</dd></div>
          </dl>
        </Card>
      )}
    </div>
  );
}
