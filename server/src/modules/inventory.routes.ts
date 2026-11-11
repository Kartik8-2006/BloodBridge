import { Router } from 'express';
import { currentUser, requireRole } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import { adjustStock, applyStock, assertDirection, stockStatus } from '../services/inventory.js';
import { audit } from '../services/notify.js';
import { BLOOD_GROUPS, stockAdjustSchema, stockBatchSchema, thresholdSchema } from './schemas.js';
import { verifiedHospitalOf } from './staff.js';

export function inventoryRouter(d: Deps) {
  const r = Router();

  /** Own stock: every blood group, even those at zero, so the grid is always complete. */
  r.get('/', requireRole('HOSPITAL'), async (req, res) => {
    const h = await verifiedHospitalOf(d, currentUser(req));
    const items = await d.db.inventoryItem.findMany({ where: { hospitalId: h.id } });
    const units = new Map(items.map((i) => [i.bloodGroup, i.units]));
    const stock = BLOOD_GROUPS.map((bloodGroup) => {
      const u = units.get(bloodGroup) ?? 0;
      return { bloodGroup, units: u, status: stockStatus(u, h.lowStockThreshold) };
    });
    res.json({ threshold: h.lowStockThreshold, total: stock.reduce((s, x) => s + x.units, 0), stock });
  });

  r.get('/log', requireRole('HOSPITAL'), async (req, res) => {
    const h = await verifiedHospitalOf(d, currentUser(req));
    const rows = await d.db.inventoryLog.findMany({ where: { hospitalId: h.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ log: rows.map((l) => ({ id: l.id, bloodGroup: l.bloodGroup, delta: l.delta, reason: l.reason, note: l.note, createdAt: l.createdAt })) });
  });

  r.post('/adjust', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const h = await verifiedHospitalOf(d, me);
    const body = parse(stockAdjustSchema, req.body);
    assertDirection(body.reason, body.delta);
    const result = await adjustStock(d.db, { hospitalId: h.id, bloodGroup: body.bloodGroup, delta: body.delta, reason: body.reason, note: body.note, actorId: me.id });
    await audit(d.db, me.id, 'inventory.adjust', 'Hospital', h.id, { bloodGroup: body.bloodGroup, delta: body.delta, reason: body.reason });
    res.json({ units: result.units });
  });

  /** Several groups at once from the quick-edit grid. All or nothing. */
  r.post('/batch', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const h = await verifiedHospitalOf(d, me);
    const body = parse(stockBatchSchema, req.body);
    const groups = body.changes.map((c) => c.bloodGroup);
    if (new Set(groups).size !== groups.length) throw ApiError.badRequest('Each blood group can appear once per save.');
    for (const c of body.changes) assertDirection(c.reason, c.delta);
    const { rows } = await applyStock(d.db, { hospitalId: h.id, actorId: me.id, changes: body.changes.map((c) => ({ ...c, note: c.note ?? body.note })) });
    await audit(d.db, me.id, 'inventory.batch', 'Hospital', h.id, { changes: body.changes.map((c) => ({ g: c.bloodGroup, d: c.delta, r: c.reason })) });
    res.json({ stock: rows.map((r) => ({ bloodGroup: r.bloodGroup, units: r.units })) });
  });

  r.patch('/threshold', requireRole('HOSPITAL'), async (req, res) => {
    const h = await verifiedHospitalOf(d, currentUser(req));
    const { lowStockThreshold } = parse(thresholdSchema, req.body);
    await d.db.hospital.update({ where: { id: h.id }, data: { lowStockThreshold } });
    res.json({ threshold: lowStockThreshold });
  });

  /** For requesters choosing a hospital: a coarse signal, never exact counts. */
  r.get('/status/:hospitalId', async (req, res) => {
    const h = await d.db.hospital.findUnique({ where: { id: String(req.params.hospitalId) } });
    if (!h || h.status !== 'VERIFIED') throw ApiError.notFound('Hospital not found.');
    const items = await d.db.inventoryItem.findMany({ where: { hospitalId: h.id } });
    const units = new Map(items.map((i) => [i.bloodGroup, i.units]));
    res.json({ stock: BLOOD_GROUPS.map((bloodGroup) => ({ bloodGroup, status: stockStatus(units.get(bloodGroup) ?? 0, h.lowStockThreshold) })) });
  });

  return r;
}
