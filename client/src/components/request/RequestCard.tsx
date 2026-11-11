import { ChevronRight, Clock, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Misc';
import type { RequestSummary } from '../../lib/types';
import { BloodChip, Progress, RequestStatusBadge, UrgencyBadge, formatWhen, whenLeft } from './bits';

export function RequestCard({ r, showPatient = true }: { r: RequestSummary; showPatient?: boolean }) {
  return (
    <Link to={`/app/requests/${r.id}`} className="group block">
      <Card className="p-5 transition group-hover:border-brand-200 group-hover:shadow-glow sm:p-6">
        <div className="flex items-start gap-4">
          <BloodChip group={r.bloodGroup} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-bold text-ink-900">{showPatient ? r.patientName : `Patient at ${r.hospital.name}`}</p>
              <UrgencyBadge urgency={r.urgency} />
              <RequestStatusBadge status={r.status} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-ink-600">
              <MapPin className="size-4 shrink-0" /> {r.hospital.name}{r.hospital.city ? `, ${r.hospital.city}` : ''}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500">
              <Clock className="size-4 shrink-0" /> Needed by {formatWhen(r.neededBy)}{r.status === 'OPEN' ? ` · ${whenLeft(r.neededBy)}` : ''}
            </p>
            <div className="mt-4"><Progress done={r.unitsFulfilled} total={r.unitsNeeded} /></div>
            <p className="mt-3 text-xs font-semibold text-ink-500">{r.matchedCount} donors alerted · {r.accepted} on the way</p>
          </div>
          <ChevronRight className="mt-1 size-5 shrink-0 text-ink-300 transition group-hover:text-brand-600" />
        </div>
      </Card>
    </Link>
  );
}
