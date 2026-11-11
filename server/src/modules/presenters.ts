import type { DonorProfile, Hospital, User } from '../generated/prisma/client.js';
import { DEFAULT_PREFS, type Prefs } from './schemas.js';
import { evaluateEligibility, healthSchema } from '../services/eligibility.js';

export function serializeUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    imageUrl: u.imageUrl,
    phone: u.phone,
    role: u.role,
    status: u.status,
    city: u.city,
    lat: u.lat,
    lng: u.lng,
    onboarded: Boolean(u.onboardedAt),
    prefs: { ...DEFAULT_PREFS, ...((u.prefs as Partial<Prefs> | null) ?? {}) } as Prefs,
    createdAt: u.createdAt,
  };
}

export function serializeDonor(p: DonorProfile, now = new Date()) {
  const health = healthSchema.parse(p.health ?? {});
  return {
    donor: {
      bloodGroup: p.bloodGroup,
      dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
      gender: p.gender,
      weightKg: p.weightKg,
      city: p.city,
      addressLine: p.addressLine,
      lat: p.lat,
      lng: p.lng,
      lastDonationAt: p.lastDonationAt ? p.lastDonationAt.toISOString().slice(0, 10) : null,
      available: p.available,
      health,
    },
    eligibility: evaluateEligibility(
      { dateOfBirth: p.dateOfBirth, gender: p.gender, weightKg: p.weightKg, lastDonationAt: p.lastDonationAt, health },
      now,
    ),
  };
}

/** What anyone on the internet may see. Pending, rejected and suspended states are shown as plain "listed". */
export function serializePublicHospital(h: Hospital, distanceKm?: number) {
  const verified = h.status === 'VERIFIED';
  return {
    id: h.id,
    name: h.name,
    type: h.type,
    verified,
    addressLine: h.addressLine,
    city: h.city,
    state: h.state,
    phone: h.phone,
    website: h.website,
    email: verified ? h.email : null,
    ownership: h.ownership,
    hasEmergency: h.hasEmergency,
    lat: h.lat,
    lng: h.lng,
    ...(distanceKm === undefined ? {} : { distanceKm }),
  };
}

/** Full detail for the hospital's own staff. Never includes the storage path of the license. */
export function serializeOwnHospital(h: Hospital & { _count?: { staff: number } }) {
  return {
    id: h.id,
    name: h.name,
    type: h.type,
    source: h.source,
    status: h.status,
    addressLine: h.addressLine,
    city: h.city,
    state: h.state,
    postcode: h.postcode,
    lat: h.lat,
    lng: h.lng,
    phone: h.phone,
    email: h.email,
    website: h.website,
    ownership: h.ownership,
    hasEmergency: h.hasEmergency,
    licenseNumber: h.licenseNumber,
    hasLicenseDocument: Boolean(h.licenseDocPath),
    contactPerson: h.contactPerson,
    contactDesignation: h.contactDesignation,
    submittedAt: h.submittedAt,
    reviewedAt: h.reviewedAt,
    reviewNote: h.reviewNote,
    verifiedAt: h.verifiedAt,
    staffCount: h._count?.staff ?? null,
  };
}
