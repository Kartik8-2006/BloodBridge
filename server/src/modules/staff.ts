import type { User } from '../generated/prisma/client.js';
import type { Deps } from '../deps.js';
import { ApiError } from '../lib/errors.js';

/** The verified hospital a staff member works for. Inventory, camps and analytics are only for verified facilities. */
export async function verifiedHospitalOf(d: Deps, me: User) {
  if (!me.hospitalId) throw ApiError.badRequest('Link your hospital first.');
  const h = await d.db.hospital.findUnique({ where: { id: me.hospitalId } });
  if (!h) throw ApiError.notFound('Hospital not found.');
  if (h.status !== 'VERIFIED') throw ApiError.forbidden('This unlocks once your hospital is verified.');
  return h;
}
