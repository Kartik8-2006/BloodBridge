import type { BloodGroup } from './types';

export type StockStatus = 'OUT' | 'LOW' | 'OK';
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface StockRow { bloodGroup: BloodGroup; units: number; status: StockStatus }
export interface InventoryResponse { threshold: number; total: number; stock: StockRow[] }
export interface LogRow { id: string; bloodGroup: BloodGroup; delta: number; reason: 'RECEIVED' | 'ISSUED' | 'EXPIRED' | 'ADJUSTED'; note: string | null; createdAt: string }

export interface Camp {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  city: string;
  lat: number;
  lng: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  registered: number;
  spotsLeft: number;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  hospital: { id: string; name: string; city: string | null; phone: string | null };
}
export interface CampReg { id: string; status: 'REGISTERED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'; camp: Camp }
export interface CampAttendee { id: string; status: CampReg['status']; donorName: string; bloodGroup: BloodGroup | null; registeredAt: string }

export interface GroupForecast {
  bloodGroup: BloodGroup;
  stock: number;
  stockStatus: StockStatus;
  expectedWeeklyDemand: number;
  daysOfCover: number | null;
  risk: Risk;
  reachableDonors: number;
}
export interface ForecastResponse { generatedAt: string; groups: GroupForecast[]; narrative: string | null; aiAvailable: boolean }

export interface HospitalAnalytics {
  summary: {
    requests: number;
    fulfilmentRate: number | null;
    avgHoursToFulfil: number | null;
    donationsLast6Months: number;
    unitsReceived30d: number;
    unitsIssued30d: number;
    campsHeld: number;
    campDonors: number;
  };
  weekly: { week: string; requests: number; fulfilled: number }[];
  demandByGroup: { bloodGroup: BloodGroup; unitsRequested: number }[];
  donationsByMonth: { month: string; donations: number }[];
}

export interface TriageSuggestion {
  urgency: 'CRITICAL' | 'URGENT' | 'PLANNED';
  bloodGroup: BloodGroup | null;
  unitsNeeded: number | null;
  summary: string;
  advice: string;
  callEmergency: boolean;
}
