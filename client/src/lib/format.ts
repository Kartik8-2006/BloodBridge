import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  DONOR: 'Donor',
  REQUESTER: 'Requester',
  HOSPITAL: 'Hospital',
  ADMIN: 'Admin',
};

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const number = (n: number) => n.toLocaleString('en-IN');

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const ACTION_LABEL: Record<string, string> = {
  'hospital.claimed': 'submitted a hospital claim',
  'hospital.registered': 'registered a new facility',
  'hospital.resubmitted': 'resubmitted a hospital',
  'hospital.approve': 'approved a hospital',
  'hospital.reject': 'rejected a hospital',
  'hospital.suspend': 'suspended a hospital',
  'hospital.reinstate': 'reinstated a hospital',
  'user.suspended': 'suspended a user',
  'user.reinstated': 'reinstated a user',
  'osm.sync': 'imported hospitals from OpenStreetMap',
};

/** Money is stored in paise. */
export const formatINR = (paise: number) =>
  (paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2 });
