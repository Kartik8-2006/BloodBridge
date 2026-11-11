import { Ambulance, Droplets, ExternalLink, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PublicHospital } from '../../lib/types';
import { Badge } from '../ui/Misc';

const OWNERSHIP: Record<string, string> = { private: 'Private', government: 'Government', charity: 'Charitable' };

export function HospitalCard({ h, to, requestTo }: { h: PublicHospital; to: string; requestTo?: string }) {
  const place = [h.addressLine, h.city].filter(Boolean).join(', ');
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card transition hover:border-ink-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={to} className="line-clamp-2 text-base font-bold text-ink-900 hover:text-brand-700">
            {h.name}
          </Link>
          {place && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-500">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span className="line-clamp-2">{place}</span>
            </p>
          )}
        </div>
        {h.distanceKm !== undefined && <span className="shrink-0 rounded-full bg-ink-100 px-3 py-1 text-xs font-bold text-ink-700">{h.distanceKm} km</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {h.verified ? <Badge tone="good">On BloodBridge</Badge> : <Badge>Listed</Badge>}
        {h.type === 'BLOOD_BANK' && (
          <Badge tone="brand">
            <Droplets className="size-3.5" /> Blood bank
          </Badge>
        )}
        {h.hasEmergency && (
          <Badge tone="warn">
            <Ambulance className="size-3.5" /> Emergency
          </Badge>
        )}
        {h.ownership && OWNERSHIP[h.ownership] && <Badge>{OWNERSHIP[h.ownership]}</Badge>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-100 pt-4 text-sm">
        {h.phone ? (
          <a href={`tel:${h.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
            <Phone className="size-4" /> {h.phone}
          </a>
        ) : (
          <span className="text-ink-400">No phone listed</span>
        )}
        {requestTo && h.verified && (
          <Link to={requestTo} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 font-bold text-white hover:bg-brand-700">
            <Droplets className="size-4" /> Request blood
          </Link>
        )}
        {h.website && (
          <a href={h.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 font-semibold text-ink-600 hover:text-ink-900">
            <ExternalLink className="size-4" /> Website
          </a>
        )}
      </div>
    </div>
  );
}
