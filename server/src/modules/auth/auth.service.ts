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

export async function login(
  password: string,
  actorName: string,
): Promise<{ token: string; expiresAt: Date; actorName: string } | null> {
  const settings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });
  if (!verifyPassword(password, settings.adminPasswordHash)) return null;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.adminSession.create({ data: { expiresAt, actorName } });
  return { token: session.token, expiresAt, actorName };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.adminSession.delete({ where: { token } }).catch(() => {});
}

/** Returns the session's actor name if the token is valid, or null (also used as the validity check). */
export async function getSession(token: string | undefined): Promise<{ actorName: string | null } | null> {
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({ where: { token } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return { actorName: session.actorName };
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  return (await getSession(token)) != null;
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
