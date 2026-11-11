import { Router, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import { BLOOD_GROUP_LABEL } from '../services/inventory.js';
import { audit } from '../services/notify.js';
import { verifiedHospitalOf } from './staff.js';

const range = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const MAX_ROWS = 5000;

/** Spreadsheet apps run cells that start with = + - @ as formulas, so those are defused with a leading quote. */
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const send = (res: Response, name: string, body: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send('﻿' + body); // BOM so Excel reads UTF-8 names correctly
};
const window = (q: z.infer<typeof range>) => ({
  ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:30`) } : {}),
  ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000) } : {}),
});

/** Hospital data exports. Only the caller's own verified hospital, and nothing a donor did not already hand to the desk. */
export function exportsRouter(d: Deps) {
  const r = Router();

  r.get('/donations.csv', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const h = await verifiedHospitalOf(d, me);
    const q = parse(range, req.query);
    const rows = await d.db.donation.findMany({
      where: { hospitalId: h.id, donatedAt: window(q) },
      orderBy: { donatedAt: 'desc' },
      take: MAX_ROWS,
      include: { donor: { select: { name: true } } },
    });
    await audit(d.db, me.id, 'export.donations', 'Hospital', h.id, { rows: rows.length });
    send(res, 'donations.csv', csv([['Certificate', 'Donated at', 'Donor', 'Blood group', 'Units'], ...rows.map((x) => [x.certificateNo, x.donatedAt, x.donor.name, BLOOD_GROUP_LABEL[x.bloodGroup], x.units])]));
  });

  r.get('/inventory.csv', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const h = await verifiedHospitalOf(d, me);
    const q = parse(range, req.query);
    const rows = await d.db.inventoryLog.findMany({ where: { hospitalId: h.id, createdAt: window(q) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS });
    await audit(d.db, me.id, 'export.inventory', 'Hospital', h.id, { rows: rows.length });
    send(res, 'inventory-log.csv', csv([['Date', 'Blood group', 'Change', 'Reason', 'Note'], ...rows.map((x) => [x.createdAt, BLOOD_GROUP_LABEL[x.bloodGroup], x.delta, x.reason, x.note])]));
  });

  return r;
}
