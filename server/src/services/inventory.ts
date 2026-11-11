import type { Db } from '../lib/prisma.js';
import type { BloodGroup, InventoryReason } from '../generated/prisma/client.js';
import { ApiError } from '../lib/errors.js';
import { notifyMany } from './notify.js';

export const BLOOD_GROUP_LABEL: Record<BloodGroup, string> = {
  A_POS: 'A+', A_NEG: 'A-', B_POS: 'B+', B_NEG: 'B-', AB_POS: 'AB+', AB_NEG: 'AB-', O_POS: 'O+', O_NEG: 'O-',
};

export interface StockChange {
  bloodGroup: BloodGroup;
  delta: number;
  reason: InventoryReason;
  note?: string | null;
}

/**
 * Applies one or many stock changes and their ledger entries in a single transaction: either everything
 * lands or nothing does. Stock can never go negative. Staff are alerted once per group that falls to the threshold.
 */
export async function applyStock(db: Db, input: { hospitalId: string; changes: StockChange[]; actorId?: string | null }) {
  const { hospitalId } = input;
  const { rows, threshold } = await db.$transaction(async (tx) => {
    const hospital = await tx.hospital.findUnique({ where: { id: hospitalId }, select: { lowStockThreshold: true } });
    if (!hospital) throw ApiError.notFound('Hospital not found.');
    const out: { bloodGroup: BloodGroup; previous: number; units: number; delta: number }[] = [];
    for (const c of input.changes) {
      const row = await tx.inventoryItem.upsert({
        where: { hospitalId_bloodGroup: { hospitalId, bloodGroup: c.bloodGroup } },
        create: { hospitalId, bloodGroup: c.bloodGroup, units: 0 },
        update: {},
      });
      const next = row.units + c.delta;
      if (next < 0) throw ApiError.badRequest(`Only ${row.units} unit${row.units === 1 ? '' : 's'} of ${BLOOD_GROUP_LABEL[c.bloodGroup]} in stock.`);
      await tx.inventoryItem.update({ where: { id: row.id }, data: { units: next } });
      await tx.inventoryLog.create({ data: { hospitalId, bloodGroup: c.bloodGroup, delta: c.delta, reason: c.reason, note: c.note ?? null, actorId: input.actorId ?? null } });
      out.push({ bloodGroup: c.bloodGroup, previous: row.units, units: next, delta: c.delta });
    }
    return { rows: out, threshold: hospital.lowStockThreshold };
  });

  const crossed = rows.filter((r) => r.delta < 0 && r.previous > threshold && r.units <= threshold);
  if (crossed.length) {
    const staff = await db.user.findMany({ where: { hospitalId, status: 'ACTIVE' }, select: { id: true } });
    for (const r of crossed) {
      await notifyMany(db, staff.map((x) => x.id), {
        type: 'LOW_STOCK',
        title: `Low stock: ${BLOOD_GROUP_LABEL[r.bloodGroup]}`,
        body: `Only ${r.units} unit${r.units === 1 ? '' : 's'} of ${BLOOD_GROUP_LABEL[r.bloodGroup]} left. Consider posting a request or a donation camp.`,
        data: { bloodGroup: r.bloodGroup },
      });
    }
  }
  return { rows, threshold };
}

/** Single-change convenience used by camps. */
export async function adjustStock(db: Db, input: { hospitalId: string; bloodGroup: BloodGroup; delta: number; reason: InventoryReason; note?: string | null; actorId?: string | null }) {
  const { rows, threshold } = await applyStock(db, { hospitalId: input.hospitalId, actorId: input.actorId, changes: [{ bloodGroup: input.bloodGroup, delta: input.delta, reason: input.reason, note: input.note }] });
  return { previous: rows[0]!.previous, units: rows[0]!.units, threshold };
}

/** Direction rules shared by the single and batch endpoints. */
export function assertDirection(reason: InventoryReason, delta: number) {
  if (reason === 'RECEIVED' && delta < 0) throw ApiError.badRequest('Units received must be a positive number.');
  if ((reason === 'ISSUED' || reason === 'EXPIRED') && delta > 0) throw ApiError.badRequest('Issued or expired units must be a negative number.');
}

export const stockStatus = (units: number, threshold: number): 'OUT' | 'LOW' | 'OK' => (units <= 0 ? 'OUT' : units <= threshold ? 'LOW' : 'OK');
