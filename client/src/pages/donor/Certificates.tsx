import { useQuery } from '@tanstack/react-query';
import { Award, Droplets, HeartPulse, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, ErrorNote, Logo, PageHeader, PageLoader } from '../../components/ui/Misc';
import { StatCard } from '../../components/ui/StatCard';
import { BloodChip } from '../../components/request/bits';
import { api } from '../../lib/api';
import { bloodLabel } from '../../lib/blood';
import { formatDate } from '../../lib/format';
import type { DonationItem } from '../../lib/types';

export function Certificates() {
  const list = useQuery({ queryKey: ['donations'], queryFn: () => api.get<{ totals: { donations: number; units: number; livesImpacted: number }; items: DonationItem[] }>('/donations') });
  if (list.isLoading) return <PageLoader />;
  if (list.isError || !list.data) return <ErrorNote>{list.error instanceof Error ? list.error.message : 'Could not load certificates.'}</ErrorNote>;
  const { totals, items } = list.data;

  return (
    <div>
      <PageHeader title="My donations" subtitle="Every donation a hospital has confirmed, with a certificate anyone can verify." />
      <div className="grid gap-5 md:grid-cols-3">
        <StatCard icon={Droplets} label="Donations" value={totals.donations} tone="brand" />
        <StatCard icon={HeartPulse} label="Units given" value={totals.units} />
        <StatCard icon={Award} label="Lives impacted" value={totals.livesImpacted} hint="One donation can help up to 3 patients" tone="good" />
      </div>
      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState icon={<Award className="size-6" />} title="Your first certificate is waiting" body="After a hospital confirms your donation with your code, it appears here." action={<Link to="/app/inbox"><Button>See requests near me</Button></Link>} />
        ) : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-ink-100">
              {items.map((d) => (
                <li key={d.id}>
                  <Link to={`/app/certificates/${d.id}`} className="flex items-center gap-4 px-6 py-5 hover:bg-ink-50">
                    <BloodChip group={d.bloodGroup} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink-900">{d.hospital.name}</span>
                      <span className="block text-sm text-ink-500">{formatDate(d.donatedAt)} · <span className="font-mono">{d.certificateNo}</span></span>
                    </span>
                    <span className="text-sm font-bold text-brand-700">View</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

export function CertificateSheet({ d, verifyUrl }: { d: Pick<DonationItem, 'donorName' | 'bloodGroup' | 'units' | 'donatedAt' | 'certificateNo'> & { hospital: string; city?: string | null }; verifyUrl: string }) {
  return (
    <div className="print-sheet mx-auto max-w-3xl rounded-[2rem] border-4 border-double border-brand-300 bg-white p-8 text-center shadow-card sm:p-14">
      <div className="flex justify-center"><Logo /></div>
      <p className="mt-8 text-sm font-semibold text-ink-500">Certificate of blood donation</p>
      <p className="mt-6 text-sm text-ink-600">This certifies that</p>
      <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-ink-900">{d.donorName}</h2>
      <p className="mx-auto mt-6 max-w-lg text-ink-700">
        voluntarily donated {d.units} {d.units === 1 ? 'unit' : 'units'} of blood ({bloodLabel(d.bloodGroup)}) at <strong>{d.hospital}</strong>{d.city ? `, ${d.city}` : ''} on <strong>{formatDate(d.donatedAt)}</strong>.
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm text-ink-500">Thank you. One donation can help up to three patients.</p>
      <div className="mt-10 border-t border-ink-100 pt-6 text-xs text-ink-500">
        <p>Certificate number <span className="font-mono font-bold text-ink-800">{d.certificateNo}</span></p>
        <p className="mt-1 break-all">Verify at {verifyUrl}</p>
      </div>
    </div>
  );
}

export function CertificateView() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['donations', id], queryFn: () => api.get<DonationItem>(`/donations/${id}`) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <EmptyState title="Certificate not found" action={<Link to="/app/certificates"><Button>Back to donations</Button></Link>} />;
  const d = q.data;
  return (
    <div>
      <div className="no-print"><PageHeader title="Certificate" right={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print or save as PDF</Button>} /></div>
      <CertificateSheet d={{ ...d, hospital: d.hospital.name, city: d.hospital.city }} verifyUrl={`${window.location.origin}/verify/${d.certificateNo}`} />
    </div>
  );
}
