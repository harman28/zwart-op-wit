import type { MembershipType } from '@prisma/client';
import { prisma } from '../../db/client.js';

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
  return prisma.player.create({ data: { name, membershipType } });
}

export async function importPlayers(entries: { name: string; membershipType: MembershipType }[]) {
  return prisma.$transaction(entries.map((e) => prisma.player.create({ data: e })));
}

export async function updatePlayer(
  id: number,
  data: { name?: string; membershipType?: MembershipType; notes?: string | null },
) {
  return prisma.player.update({ where: { id }, data });
}
