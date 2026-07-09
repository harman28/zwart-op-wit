import type { Gender, MembershipType } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Case-insensitive, since the roster-reuse logic elsewhere (matching an
 * imported/pasted name against an existing player) already treats names that
 * way — two players differing only by case would be confusing for everyone
 * and is almost always a duplicate, not a real distinction.
 */
export async function assertNameAvailable(name: string, excludePlayerId?: number): Promise<void> {
  const existing = await prisma.player.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' }, ...(excludePlayerId ? { id: { not: excludePlayerId } } : {}) },
  });
  if (existing) throw new HttpError(409, `A player named "${existing.name}" already exists`);
}

/**
 * "Games this season" for a guest is counted as rounds signed up for in the
 * current (active, not-yet-ended) season — purely informational, never
 * auto-enforced; admins decide manually whether to ask a guest to register.
 */
export async function listPlayersWithGuestCounts() {
  const currentSeason = await prisma.season.findFirst({
    where: { endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  const players = await prisma.player.findMany({ orderBy: { name: 'asc' } });

  if (!currentSeason) {
    return players.map((p) => ({ ...p, roundsThisSeason: 0 }));
  }

  const signupCounts = await prisma.roundSignup.groupBy({
    by: ['playerId'],
    where: { round: { seasonId: currentSeason.id } },
    _count: { playerId: true },
  });
  const countByPlayer = new Map(signupCounts.map((c) => [c.playerId, c._count.playerId]));

  return players.map((p) => ({ ...p, roundsThisSeason: countByPlayer.get(p.id) ?? 0 }));
}

export async function createPlayer(name: string, membershipType: MembershipType) {
  await assertNameAvailable(name);
  return prisma.player.create({ data: { name, membershipType } });
}

export async function importPlayers(entries: { name: string; membershipType: MembershipType }[]) {
  // Within-batch duplicates (case-insensitive) are just as confusing as
  // against-the-roster ones, and won't be caught by per-entry DB lookups
  // since none of them exist yet at check time.
  const seen = new Set<string>();
  for (const e of entries) {
    const key = e.name.trim().toLowerCase();
    if (seen.has(key)) throw new HttpError(409, `"${e.name}" appears more than once in this import`);
    seen.add(key);
    await assertNameAvailable(e.name);
  }
  return prisma.$transaction(entries.map((e) => prisma.player.create({ data: e })));
}

export async function updatePlayer(
  id: number,
  data: {
    name?: string;
    membershipType?: MembershipType;
    notes?: string | null;
    gender?: Gender | null;
    knsbId?: string | null;
    federation?: string;
  },
) {
  if (data.name) await assertNameAvailable(data.name, id);
  return prisma.player.update({ where: { id }, data });
}
