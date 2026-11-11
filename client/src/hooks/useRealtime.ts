import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { connectSocket } from '../lib/socket';

const KEYS = ['me', 'notifications', 'dashboard', 'inbox', 'requests', 'request', 'donations', 'inventory', 'camps', 'my-camps', 'billing', 'fraud', 'admin-overview'];

const TOAST: Record<string, string> = {
  REQUEST_MATCH: 'New blood request near you',
  REQUEST_ACCEPTED: 'A donor accepted',
  REQUEST_UPDATE: 'Your request has an update',
  REQUEST_CANCELLED: 'A request was closed',
  DONATION_COMPLETE: 'Donation confirmed. Thank you!',
  CAMP_NEW: 'A donation camp near you',
  CAMP_UPDATE: 'A camp you joined changed',
  LOW_STOCK: 'Low blood stock at your hospital',
  REMINDER: 'A reminder from BloodBridge',
  PAYMENT_SUCCESS: 'Payment received. Pro is active',
  FRAUD_ALERT: 'Suspicious activity needs review',
  HOSPITAL_APPROVED: 'Your hospital was approved',
  HOSPITAL_REJECTED: 'Your hospital needs changes',
};

/** Keeps every open screen fresh the moment something relevant happens. */
export function useRealtime(enabled: boolean, onToast: (text: string) => void) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const socket = connectSocket(() => getToken());
    socket.on('notification', (p: { type?: string }) => {
      for (const k of KEYS) void qc.invalidateQueries({ queryKey: [k] });
      onToast(TOAST[p.type ?? ''] ?? 'You have a new notification');
    });
    return () => {
      socket.disconnect();
    };
    // getToken and onToast are stable enough for the lifetime of the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
