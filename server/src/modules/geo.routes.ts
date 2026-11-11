import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import { latSchema, lngSchema } from './schemas.js';

export function geoRouter(d: Deps) {
  const r = Router();

  r.get('/search', async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().min(2, 'Type at least 2 characters').max(120) }), req.query);
    res.json({ places: await d.geocoder.search(q) });
  });

  r.get('/reverse', async (req, res) => {
    const { lat, lng } = parse(z.object({ lat: latSchema, lng: lngSchema }), req.query);
    res.json({ place: await d.geocoder.reverse(lat, lng) });
  });

  return r;
}
