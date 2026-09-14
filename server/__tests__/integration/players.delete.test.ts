import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { env } from '../../src/env.js';
import { ensureClubSettings } from '../../src/modules/auth/auth.service.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error('no set-cookie header in response');
  return header.split(';')[0]!;
}

describe('DELETE /api/admin/players/:id (real Postgres)', () => {
  const app = buildApp();
  let cookie = '';
  const createdPlayerIds: number[] = [];
  let seasonId = -1;

  beforeAll(async () => {
    await ensureClubSettings();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: env.ADMIN_INITIAL_PASSWORD, name: 'Tester' },
    });
    cookie = extractCookie(loginRes.headers['set-cookie']);
  });

  afterAll(async () => {
    if (seasonId !== -1) await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
    for (const id of createdPlayerIds) await prisma.player.delete({ where: { id } }).catch(() => {});
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  it('deletes a player with no round history, including their stray enrollment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'DeleteTestNeverPlayed' },
    });
    const playerId = res.json().id as number;
    createdPlayerIds.push(playerId);

    // Enrolled in a season but never appears in any round — exactly the
    // "typo'd duplicate created today" shape this feature targets.
    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: { name: 'Delete Test Season', topValue: 100, roster: [{ playerId, startingValue: 100 }] },
    });
    seasonId = seasonRes.json().id;

    const deleteRes = await app.inject({ method: 'DELETE', url: `/api/admin/players/${playerId}`, headers: { cookie } });
    expect(deleteRes.statusCode).toBe(204);

    const stillExists = await prisma.player.findUnique({ where: { id: playerId } });
    expect(stillExists).toBeNull();
    const enrollmentGone = await prisma.seasonEnrollment.findUnique({
      where: { seasonId_playerId: { seasonId, playerId } },
    });
    expect(enrollmentGone).toBeNull();
    createdPlayerIds.splice(createdPlayerIds.indexOf(playerId), 1);

    // Only one active season at a time is a real domain rule — end this one
    // now so the next test can create its own.
    await prisma.season.delete({ where: { id: seasonId } });
    seasonId = -1;
  });

  it('refuses to delete a player who has actually played, and archive still works for them', async () => {
    const names = ['DeleteTestAlice', 'DeleteTestBob'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob] = playerIds as [number, number];

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Delete Test Season 2',
        topValue: 100,
        roster: [
          { playerId: alice, startingValue: 100 },
          { playerId: bob, startingValue: 99 },
        ],
      },
    });
    const season2Id = seasonRes.json().id;

    const roundRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${season2Id}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-03-01', signedUpPlayerIds: [alice, bob] },
    });
    expect(roundRes.statusCode).toBe(201);

    const deleteRes = await app.inject({ method: 'DELETE', url: `/api/admin/players/${alice}`, headers: { cookie } });
    expect(deleteRes.statusCode).toBe(409);
    expect(deleteRes.json().error).toContain('round history');

    const stillExists = await prisma.player.findUnique({ where: { id: alice } });
    expect(stillExists).not.toBeNull();

    // Archive remains the correct path for someone with real history.
    const archiveRes = await app.inject({ method: 'POST', url: `/api/admin/players/${alice}/archive`, headers: { cookie } });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().archivedAt).not.toBeNull();

    await prisma.season.delete({ where: { id: season2Id } });
  });
});
