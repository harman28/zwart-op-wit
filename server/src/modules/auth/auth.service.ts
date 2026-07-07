import { prisma } from '../../db/client.js';
import { env } from '../../env.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE_NAME = 'zow_session';

/** Seeds the ClubSettings singleton on first boot if it doesn't exist yet. Safe to call every startup. */
export async function ensureClubSettings(): Promise<void> {
  const existing = await prisma.clubSettings.findUnique({ where: { id: 1 } });
  if (existing) return;
  await prisma.clubSettings.create({
    data: { id: 1, adminPasswordHash: hashPassword(env.ADMIN_INITIAL_PASSWORD) },
  });
}

export async function login(password: string): Promise<{ token: string; expiresAt: Date } | null> {
  const settings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });
  if (!verifyPassword(password, settings.adminPasswordHash)) return null;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.adminSession.create({ data: { expiresAt } });
  return { token: session.token, expiresAt };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.adminSession.delete({ where: { token } }).catch(() => {});
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const session = await prisma.adminSession.findUnique({ where: { token } });
  if (!session) return false;
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
    return false;
  }
  return true;
}

export async function changePassword(
  currentToken: string | undefined,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const settings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });
  if (!verifyPassword(currentPassword, settings.adminPasswordHash)) return false;
  await prisma.clubSettings.update({
    where: { id: 1 },
    data: { adminPasswordHash: hashPassword(newPassword) },
  });
  // Signs out every other admin session; keeps the initiator's own session valid.
  await prisma.adminSession.deleteMany({ where: { token: { not: currentToken ?? '' } } });
  return true;
}
