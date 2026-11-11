import { clerkClient } from '@clerk/express';
import type { User } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

type ClerkUserLike = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
};

function pickEmail(cu: ClerkUserLike): string {
  const email = cu.primaryEmailAddress?.emailAddress ?? cu.emailAddresses[0]?.emailAddress;
  if (!email) throw new AppError(400, 'Your account has no email address.');
  return email.toLowerCase();
}

function pickName(cu: ClerkUserLike, email: string): string {
  return [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email.split('@')[0] || 'User';
}

/** Create or refresh the local user row from a Clerk user. Never touches role/onboarding. */
export async function syncUserFromClerk(cu: ClerkUserLike): Promise<User> {
  const email = pickEmail(cu);
  const name = pickName(cu, email);
  const isAdmin = env.ADMIN_EMAILS.includes(email);

  // Same email re-created in Clerk (e.g. dev instance reset): re-link instead of failing the unique index.
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail && byEmail.clerkId !== cu.id) {
    return prisma.user.update({
      where: { id: byEmail.id },
      data: { clerkId: cu.id, name, imageUrl: cu.imageUrl },
    });
  }

  return prisma.user.upsert({
    where: { clerkId: cu.id },
    update: { email, name, imageUrl: cu.imageUrl },
    create: {
      clerkId: cu.id,
      email,
      name,
      imageUrl: cu.imageUrl,
      role: isAdmin ? 'ADMIN' : null,
      onboarded: isAdmin,
    },
  });
}

/** Resolve the local user for a Clerk id, creating it on first sight. */
export async function ensureUser(clerkId: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;
  const cu = await clerkClient.users.getUser(clerkId);
  return syncUserFromClerk(cu);
}

/** Mirror the role into Clerk so the frontend can read it from the session without a round trip. */
export async function pushRoleToClerk(clerkId: string, role: string | null): Promise<void> {
  try {
    await clerkClient.users.updateUserMetadata(clerkId, { publicMetadata: { role } });
  } catch (err) {
    console.warn('Could not update Clerk metadata (non-fatal):', (err as Error).message);
  }
}
