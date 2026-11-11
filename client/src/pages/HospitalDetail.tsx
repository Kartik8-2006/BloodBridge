import { useQuery } from '@tanstack/react-query';
import { Ambulance, ArrowLeft, Copy, Droplets, ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { HospitalMap } from '../components/hospital/HospitalMap';
import { Button } from '../components/ui/Button';
import { Badge, Card, ErrorNote, PageHeader, PageLoader } from '../components/ui/Misc';
import { useMe } from '../hooks/useMe';
import { api } from '../lib/api';
import type { PublicHospital } from '../lib/types';

const OWNERSHIP: Record<string, string> = { private: 'Private', government: 'Government', charity: 'Charitable' };

export default function HospitalDetail() {
  const { id } = useParams();
  const inApp = useLocation().pathname.startsWith('/app');
  const base = inApp ? '/app/hospitals' : '/hospitals';
  const { data: me } = useMe();
  const [copied, setCopied] = useState(false);
  const q = useQuery({ queryKey: ['hospital', id], queryFn: () => api.get<{ hospital: PublicHospital }>(`/hospitals/${id}`), enabled: !!id });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorNote>{q.error instanceof Error ? q.error.message : 'Hospital not found.'}</ErrorNote>;
  const h = q.data.hospital;
  const isRequester = me?.user.role === 'REQUESTER';
  const invite = `Hello, we need blood donors for patients in our area. Please join BloodBridge (a free blood-donation network) as a verified hospital so families can reach you: ${window.location.origin}/for-hospitals`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const canClaim = !h.verified && me?.user.role === 'HOSPITAL' && !me.hospital;

  return (
    <div>
      <Link to={base} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
        <ArrowLeft className="size-4" /> Back to search
      </Link>
      <PageHeader
        title={h.name}
        subtitle={[h.addressLine, h.city, h.state].filter(Boolean).join(', ')}
        right={h.verified ? <Badge tone="good">Verified on BloodBridge</Badge> : <Badge>Listed from OpenStreetMap</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <div className="flex flex-wrap gap-2">
            {h.type === 'BLOOD_BANK' && <Badge tone="brand"><Droplets className="size-3.5" /> Blood bank</Badge>}
            {h.hasEmergency && <Badge tone="warn"><Ambulance className="size-3.5" /> Emergency</Badge>}
            {h.ownership && OWNERSHIP[h.ownership] && <Badge>{OWNERSHIP[h.ownership]}</Badge>}
          </div>
          <ul className="mt-6 space-y-4 text-ink-700">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-ink-400" />
              <a className="font-medium hover:text-brand-700" target="_blank" rel="noreferrer noopener" href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=17/${h.lat}/${h.lng}`}>
                {[h.addressLine, h.city, h.state].filter(Boolean).join(', ') || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
              </a>
            </li>
            {h.phone ? (
              <li className="flex items-center gap-3"><Phone className="size-5 text-ink-400" /><a href={`tel:${h.phone}`} className="font-bold text-brand-700">{h.phone}</a></li>
            ) : (
              <li className="flex items-center gap-3 text-ink-400"><Phone className="size-5" /> No phone listed</li>
            )}
            {h.email && <li className="flex items-center gap-3"><Mail className="size-5 text-ink-400" /><a href={`mailto:${h.email}`} className="font-medium hover:text-brand-700">{h.email}</a></li>}
            {h.website && (
              <li className="flex items-center gap-3"><ExternalLink className="size-5 text-ink-400" /><a href={h.website} target="_blank" rel="noreferrer noopener" className="font-medium hover:text-brand-700">Website</a></li>
            )}
          </ul>
          {h.verified && (
            <div className="mt-8">
              {isRequester ? (
                <Link to={`/app/requests/new?hospital=${h.id}`}><Button size="lg" className="w-full" icon={<Droplets className="size-5" />}>Request blood at this hospital</Button></Link>
              ) : !me ? (
                <Link to="/sign-up"><Button size="lg" className="w-full">Sign up to request blood</Button></Link>
              ) : null}
            </div>
          )}
          {!h.verified && isRequester && (
            <div className="mt-8 rounded-2xl border border-plasma-300 bg-plasma-100 p-5 text-sm text-ink-800">
              <p className="font-bold">This hospital has not joined BloodBridge yet</p>
              <p className="mt-1">Requests can only go to hospitals we have verified, so donors always arrive somewhere that can receive them. You can call them directly, invite them to join, or pick a verified hospital nearby.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/app/requests/new"><Button size="sm">See verified hospitals near me</Button></Link>
                <Button size="sm" variant="outline" icon={<Copy className="size-4" />} onClick={copyInvite}>{copied ? 'Invite copied' : 'Copy invite message'}</Button>
              </div>
            </div>
          )}
          {!h.verified && (
            <div className="mt-8 rounded-2xl bg-ink-50 p-5 text-sm text-ink-600">
              <p className="font-bold text-ink-800">Is this your facility?</p>
              <p className="mt-1">Claim it to get verified and join the network.</p>
              <Link to={canClaim ? `/app/my-hospital?claim=${h.id}` : '/sign-up'} className="mt-3 inline-block font-bold text-brand-700 hover:text-brand-800">
                {canClaim ? 'Claim this hospital' : 'Create a hospital account'}
              </Link>
            </div>
          )}
        </Card>
        <HospitalMap items={[h]} center={undefined} detailBase={base} height={420} />
      </div>
    </div>
  );
}
