import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const publicRouter = Router();

/** Real platform numbers for the landing page. Nothing here is hardcoded. */
publicRouter.get('/stats', async (_req, res) => {
  const [hospitals, verifiedHospitals, bloodBanks, donors, fulfilledRequests, states] = await Promise.all([
    prisma.hospital.count(),
    prisma.hospital.count({ where: { status: 'VERIFIED' } }),
    prisma.hospital.count({ where: { hasBloodBank: true } }),
    prisma.donorProfile.count(),
    prisma.bloodRequest.count({ where: { status: 'FULFILLED' } }),
    prisma.hospital.groupBy({ by: ['state'], where: { state: { not: null } } }),
  ]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ hospitals, verifiedHospitals, bloodBanks, donors, fulfilledRequests, states: states.length });
});
