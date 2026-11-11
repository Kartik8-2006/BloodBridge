import { Award, BarChart3, Bell, Boxes, Building2, CalendarDays, ClipboardList, Crown, HeartPulse, IndianRupee, LayoutDashboard, ScrollText, Settings, ShieldAlert, ShieldCheck, Stethoscope, User, Users, type LucideIcon } from 'lucide-react';
import type { Role } from './types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface RoleNav {
  items: NavItem[];
  cta: { label: string; to: string };
}

const common: NavItem[] = [
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
  { to: '/app/profile', label: 'Profile', icon: User },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const myRequests: NavItem = { to: '/app/requests', label: 'My Requests', icon: ClipboardList };
const dashboard: NavItem = { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard };
const directory: NavItem = { to: '/app/hospitals', label: 'Find Hospitals', icon: Building2 };

/** Only modules that exist in the running build are listed. New phases add their entries here. */
export const NAV: Record<Role, RoleNav> = {
  DONOR: {
    items: [dashboard, { to: '/app/inbox', label: 'Requests for You', icon: HeartPulse }, { to: '/app/certificates', label: 'Certificates', icon: Award }, { to: '/app/camps', label: 'Donation Camps', icon: CalendarDays }, directory, ...common],
    cta: { label: 'See Requests', to: '/app/inbox' },
  },
  REQUESTER: { items: [dashboard, myRequests, directory, ...common], cta: { label: 'Request Blood', to: '/app/requests/new' } },
  HOSPITAL: {
    items: [dashboard, { to: '/app/requests', label: 'Donor Calls', icon: ClipboardList }, { to: '/app/inventory', label: 'Inventory', icon: Boxes },
      { to: '/app/camps/manage', label: 'Camps', icon: CalendarDays },
      { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/app/billing', label: 'Billing', icon: Crown },
      { to: '/app/my-hospital', label: 'My Hospital', icon: Stethoscope }, ...common],
    cta: { label: 'Call Donors', to: '/app/requests/new' },
  },
  ADMIN: {
    items: [
      dashboard,
      { to: '/app/verifications', label: 'Verifications', icon: ShieldCheck },
      { to: '/app/users', label: 'Users', icon: Users },
      { to: '/app/requests', label: 'All Requests', icon: ClipboardList },
      { to: '/app/fraud', label: 'Fraud Review', icon: ShieldAlert },
      { to: '/app/audit', label: 'Audit Log', icon: ScrollText },
      { to: '/app/revenue', label: 'Revenue', icon: IndianRupee },
      directory,
      ...common,
    ],
    cta: { label: 'Review Verifications', to: '/app/verifications' },
  },
};
