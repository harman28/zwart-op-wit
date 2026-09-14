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

describe('POST /api/admin/players/import (real Postgres): enrolls into the current season', () => {
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

  it('enrolls every imported player in the active season, so they show up in Create Round suggestions', async () => {
    // A pre-existing enrolled player, so the season isn't empty and
    // defaultStartingValue has a real median to compute.
    const seedRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'ImportTestSeed' },
    });
    expect(seedRes.statusCode).toBe(201);
    const seedId = seedRes.json().id as number;
    createdPlayerIds.push(seedId);

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Import Test Season',
        topValue: 100,
        roster: [{ playerId: seedId, startingValue: 100 }],
      },
    });
    expect(seasonRes.statusCode).toBe(201);
    seasonId = seasonRes.json().id;

    // Bulk-import two brand-new names — this is the "Import roster (CSV/paste)"
    // flow on the Players tab, not "+ Add player".
    const importRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players/import',
      headers: { cookie },
      payload: {
        players: [
          { name: 'ImportTestAlice', membershipType: 'FULL' },
          { name: 'ImportTestBob', membershipType: 'GUEST' },
        ],
      },
    });
    expect(importRes.statusCode).toBe(200);
    const imported = importRes.json() as { id: number; name: string }[];
    expect(imported).toHaveLength(2);
    createdPlayerIds.push(...imported.map((p) => p.id));

    // They must be enrolled in the current season — this is what Create
    // Round's suggestions are sourced from.
    const enrolledRes = await app.inject({
      method: 'GET',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
    });
    expect(enrolledRes.statusCode).toBe(200);
    const enrolledIds = (enrolledRes.json() as { id: number }[]).map((p) => p.id);
    for (const player of imported) {
      expect(enrolledIds).toContain(player.id);
    }
  });
});
