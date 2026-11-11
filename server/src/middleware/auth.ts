import { verifyToken } from '@clerk/backend';
import { clerkMiddleware, createClerkClient, getAuth } from '@clerk/express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import type { Db } from '../lib/prisma.js';
import type { Role } from '../generated/prisma/client.js';

export interface ProfileInfo {
  email: string;
  emailVerified: boolean;
  name: string;
  imageUrl: string | null;
}

/** Abstraction over the identity provider so the API can be tested without Clerk. */
export interface AuthProvider {
  handlers: RequestHandler[];
  identify(req: Request): string | null;
  /** Verifies a raw session token (used by the websocket handshake). Returns the identity id or null. */
  verifyToken(token: string): Promise<string | null>;
  fetchProfile(clerkId: string): Promise<ProfileInfo>;
}

export function createClerkAuth(env: Env): AuthProvider {
  const client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY });
  return {
    handlers: [clerkMiddleware({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY })],
    identify: (req) => getAuth(req).userId ?? null,
    async verifyToken(token) {
      try {
        const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
        return claims.sub ?? null;
      } catch {
        return null;
      }
    },
    async fetchProfile(clerkId) {
      const u = await client.users.getUser(clerkId);
      const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
      if (!primary) throw ApiError.badRequest('Your account has no email address.');
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || primary.emailAddress.split('@')[0]!;
      return {
        email: primary.emailAddress.toLowerCase(),
        emailVerified: primary.verification?.status === 'verified',
        name,
        imageUrl: u.imageUrl ?? null,
      };
    },
  };
}

/** Resolves the DB user for every authenticated request, creating it on first sign-in. */
export function loadUser(db: Db, auth: AuthProvider, env: Env): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const clerkId = auth.identify(req);
    if (!clerkId) throw ApiError.unauthorized();

    let user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      const profile = await auth.fetchProfile(clerkId);
      const isAdmin = profile.emailVerified && env.ADMIN_EMAILS.includes(profile.email);
      user = await db.user.upsert({
        where: { clerkId },
        update: {},
        create: {
          clerkId,
          email: profile.email,
          name: profile.name,
          imageUrl: profile.imageUrl,
          role: isAdmin ? 'ADMIN' : null,
          onboardedAt: isAdmin ? new Date() : null,
        },
      });
    } else if (user.role !== 'ADMIN' && env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      // ADMIN_EMAILS was extended after this account was created. Re-check the email is verified first.
      const profile = await auth.fetchProfile(clerkId);
      if (profile.emailVerified && profile.email === user.email.toLowerCase()) {
        user = await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN', onboardedAt: user.onboardedAt ?? new Date() } });
      }
    }

    if (user.status === 'SUSPENDED') {
      throw new ApiError(403, 'account_suspended', 'This account has been suspended. Contact support to appeal.');
    }
    req.user = user;
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) throw new ApiError(403, 'onboarding_required', 'Finish setting up your account first.');
    if (!roles.includes(role)) throw ApiError.forbidden();
    next();
  };
}

export function currentUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
