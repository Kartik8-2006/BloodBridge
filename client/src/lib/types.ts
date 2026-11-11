export type Role = 'DONOR' | 'REQUESTER' | 'HOSPITAL' | 'ADMIN';
export type BloodGroup = 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG' | 'AB_POS' | 'AB_NEG' | 'O_POS' | 'O_NEG';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type FacilityType = 'HOSPITAL' | 'BLOOD_BANK';
export type HospitalStatus = 'UNCLAIMED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export interface HealthAnswers {
  recentIllness: boolean;
  takingAntibiotics: boolean;
  recentTattooOrPiercing: boolean;
  pregnantOrNursing: boolean;
  chronicCondition: boolean;
  recentSurgeryOrTransfusion: boolean;
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  nextEligibleOn: string | null;
  daysUntilEligible: number | null;
}

export interface DonorInfo {
  bloodGroup: BloodGroup;
  dateOfBirth: string;
  gender: Gender;
  weightKg: number;
  city: string;
  addressLine: string | null;
  lat: number;
  lng: number;
  lastDonationAt: string | null;
  available: boolean;
  health: HealthAnswers;
}

export interface Prefs {
  emailAlerts: boolean;
  communityAnnouncements: boolean;
  smsAlerts: boolean;
  language: 'en' | 'hi' | 'pa';
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  phone: string | null;
  role: Role | null;
  status: 'ACTIVE' | 'SUSPENDED';
  city: string | null;
  lat: number | null;
  lng: number | null;
  onboarded: boolean;
  prefs: Prefs;
  createdAt: string;
}

export interface Me {
  user: UserInfo;
  donor?: DonorInfo;
  eligibility?: Eligibility;
  hospital: { id: string; name: string; status: HospitalStatus; type: FacilityType } | null;
  unreadNotifications: number;
}

export interface PublicHospital {
  id: string;
  name: string;
  type: FacilityType;
  verified: boolean;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  ownership: string | null;
  hasEmergency: boolean;
  lat: number;
  lng: number;
  distanceKm?: number;
}

export interface HospitalSearch {
  items: PublicHospital[];
  sync: { status: 'cached' | 'synced' | 'failed'; found: number } | null;
}

export interface OwnHospital {
  id: string;
  name: string;
  type: FacilityType;
  source: 'OSM' | 'PLATFORM';
  status: HospitalStatus;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  ownership: string | null;
  hasEmergency: boolean;
  licenseNumber: string | null;
  hasLicenseDocument: boolean;
  contactPerson: string | null;
  contactDesignation: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  verifiedAt: string | null;
  staffCount: number | null;
}

export interface AdminHospital extends OwnHospital {
  claimedBy: { name: string; email: string; phone: string | null } | null;
  reviewedBy?: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { requestId?: string; donationId?: string; link?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export interface Network {
  totals: { verified: number; listed: number; bloodBanks: number; withEmergency: number };
  bands: { label: string; verified: number; listed: number }[];
  nearest: PublicHospital[];
}

export type DashboardData =
  | { role: 'DONOR'; donor: DonorInfo; eligibility: Eligibility; activity: { invitations: number; accepted: number; donations: number; livesImpacted: number }; network: Network; recent: NotificationItem[] }
  | { role: 'REQUESTER'; city: string | null; requests: { active: number; fulfilled: number }; network: Network; recent: NotificationItem[] }
  | {
      role: 'HOSPITAL';
      hospital: OwnHospital | null;
      donorsNearby?: number;
      donorsByGroup?: { bloodGroup: BloodGroup; count: number }[] | null;
      requests?: { open: number; donatedThisMonth: number };
      recent: NotificationItem[];
    }
  | { role: 'ADMIN'; recent: NotificationItem[] };

export interface AdminOverview {
  users: { total: number; donors: number; requesters: number; hospitalStaff: number; admins: number; notOnboarded: number; donorsAvailable: number };
  hospitals: { verified: number; pending: number; rejected: number; suspended: number; unclaimed: number; total: number };
  requests: { open: number; fulfilled: number; total: number; donations: number };
  osm: { areasSynced: number; facilitiesSeen: number };
  fraudOpen: number;
  signups: { month: string; DONOR: number; REQUESTER: number; HOSPITAL: number }[];
  pendingQueue: { id: string; name: string; city: string | null; type: FacilityType; submittedAt: string | null; licenseNumber: string | null }[];
  recentActivity: { id: string; action: string; entity: string; entityId: string; actor: string; createdAt: string }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role | null;
  status: 'ACTIVE' | 'SUSPENDED';
  city: string | null;
  bloodGroup: BloodGroup | null;
  hospitalName: string | null;
  createdAt: string;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Place {
  label: string;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
}

export interface PublicStats {
  donors: number;
  verifiedHospitals: number;
  listedFacilities: number;
  cities: number;
  donations: number;
}

export type Urgency = 'CRITICAL' | 'URGENT' | 'PLANNED';
export type RequestStatus = 'OPEN' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
export type ResponseStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'DONATED' | 'CANCELLED';

export interface HospitalBrief {
  id: string;
  name: string;
  city: string | null;
  addressLine: string | null;
  phone: string | null;
  lat: number;
  lng: number;
}

export interface RequestSummary {
  id: string;
  patientName: string;
  bloodGroup: BloodGroup;
  unitsNeeded: number;
  unitsFulfilled: number;
  urgency: Urgency;
  neededBy: string;
  status: RequestStatus;
  matchedCount: number;
  radiusKm: number;
  createdAt: string;
  hospital: HospitalBrief;
  accepted: number;
  declined: number;
}

export interface CommittedDonor {
  id: string;
  status: ResponseStatus;
  name: string;
  phone: string | null;
  bloodGroup: BloodGroup | null;
  distanceKm: number;
  acceptedAt: string | null;
  completedAt: string | null;
}

export type RequestDetail =
  | (RequestSummary & {
      viewer: 'OWNER' | 'HOSPITAL' | 'ADMIN';
      note: string | null;
      contactPhone: string;
      requester: { name: string; phone: string | null };
      invited: number;
      donors: CommittedDonor[];
    })
  | (RequestSummary & {
      viewer: 'DONOR';
      note: string | null;
      contactPhone: string | null;
      response: { id: string; status: ResponseStatus; distanceKm: number; codeExpiresAt: string | null };
    });

export interface InboxItem {
  responseId: string;
  status: ResponseStatus;
  distanceKm: number;
  codeExpiresAt: string | null;
  request: {
    id: string;
    patientName: string;
    bloodGroup: BloodGroup;
    unitsNeeded: number;
    urgency: Urgency;
    neededBy: string;
    status: RequestStatus;
    hospital: HospitalBrief;
  };
}

export interface DonationItem {
  id: string;
  certificateNo: string;
  bloodGroup: BloodGroup;
  units: number;
  donatedAt: string;
  donorName: string;
  hospital: { name: string; city: string | null; state: string | null };
}

export interface CertificateCheck {
  valid: boolean;
  certificateNo: string;
  donor: string;
  bloodGroup: BloodGroup;
  units: number;
  donatedAt: string;
  hospital: string;
  city: string | null;
}
