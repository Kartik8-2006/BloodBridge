export interface BillingInfo {
  billingEnabled: boolean;
  subscription: { active: boolean; currentPeriodEnd: string | null };
  plans: { free: { features: string[] }; pro: { features: string[]; monthlyPaise: number; yearlyPaise: number } };
  payments: { id: string; amount: number; currency: string; interval: 'MONTHLY' | 'YEARLY'; paidAt: string | null }[];
}

export interface CheckoutOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}

export interface FraudFlagRow {
  id: string;
  kind: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'DISMISSED' | 'CONFIRMED';
  subjectType: string;
  subjectId: string;
  summary: string;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string; email: string; role: string | null; status: 'ACTIVE' | 'SUSPENDED' } | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

export interface RevenueSummary {
  billingEnabled: boolean;
  revenuePaise: number;
  paidCount: number;
  activeSubscriptions: number;
  recent: { id: string; hospital: string; city: string | null; amount: number; interval: 'MONTHLY' | 'YEARLY'; paidAt: string | null }[];
}
