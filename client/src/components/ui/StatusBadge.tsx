import { BadgeCheck, Clock, ShieldAlert, XCircle } from 'lucide-react';
import type { HospitalStatus } from '../../lib/types';
import { Badge } from './Misc';

export function StatusBadge({ status }: { status: HospitalStatus }) {
  switch (status) {
    case 'VERIFIED':
      return <Badge tone="good"><BadgeCheck className="size-3.5" /> Verified</Badge>;
    case 'PENDING':
      return <Badge tone="warn"><Clock className="size-3.5" /> In review</Badge>;
    case 'REJECTED':
      return <Badge tone="brand"><XCircle className="size-3.5" /> Needs changes</Badge>;
    case 'SUSPENDED':
      return <Badge tone="brand"><ShieldAlert className="size-3.5" /> Suspended</Badge>;
    default:
      return <Badge>Not on BloodBridge yet</Badge>;
  }
}
