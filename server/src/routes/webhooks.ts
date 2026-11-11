import express, { Router } from 'express';
import { Webhook } from 'svix';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { syncUserFromClerk } from '../services/user.service.js';

export const webhooksRouter = Router();

type ClerkEvent = { type: string; data: unknown };

/** Clerk webhook payloads are snake_case JSON, unlike the SDK's User object. */
type WebhookUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
};

function fromWebhook(d: WebhookUser): Parameters<typeof syncUserFromClerk>[0] {
  const primary = d.email_addresses.find((e) => e.id === d.primary_email_address_id) ?? d.email_addresses[0];
  return {
    id: d.id,
    firstName: d.first_name,
    lastName: d.last_name,
    imageUrl: d.image_url,
    primaryEmailAddress: primary ? { emailAddress: primary.email_address } : null,
    emailAddresses: d.email_addresses.map((e) => ({ emailAddress: e.email_address })),
  };
}

/**
 * Clerk → our database. Optional for local dev (users are also created lazily on first API call),
 * but recommended in production so profile changes and deletions stay in sync.
 * This router is mounted BEFORE express.json() because svix needs the raw body.
 */
webhooksRouter.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!env.CLERK_WEBHOOK_SECRET) throw new AppError(503, 'Webhook secret is not configured.');

  const headers = {
    'svix-id': String(req.headers['svix-id'] ?? ''),
    'svix-timestamp': String(req.headers['svix-timestamp'] ?? ''),
    'svix-signature': String(req.headers['svix-signature'] ?? ''),
  };

  let event: ClerkEvent;
  try {
    event = new Webhook(env.CLERK_WEBHOOK_SECRET).verify(req.body.toString('utf8'), headers) as unknown as ClerkEvent;
  } catch {
    throw new AppError(400, 'Invalid webhook signature.');
  }

  if (event.type === 'user.created' || event.type === 'user.updated') {
    await syncUserFromClerk(fromWebhook(event.data as WebhookUser));
  } else if (event.type === 'user.deleted') {
    const id = (event.data as { id?: string }).id;
    if (id) await prisma.user.updateMany({ where: { clerkId: id }, data: { isSuspended: true } });
  }

  res.json({ received: true });
});
