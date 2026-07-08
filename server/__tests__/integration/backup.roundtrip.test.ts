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

describe('backup export -> wipe -> import round-trip (real Postgres)', () => {
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

  it(
    'produces an identical leaderboard after export, wipe, and reimport',
    async () => {
      const names = ['BackupJoppe', 'BackupJim', 'BackupMaurice', 'BackupSebastian'];
      const playerIds: number[] = [];
      for (const name of names) {
        const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
        playerIds.push(res.json().id);
      }
      createdPlayerIds.push(...playerIds);
      const [joppe, jim, maurice, sebastian] = playerIds as [number, number, number, number];

      const seasonRes = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: {
          name: 'Backup Roundtrip Season',
          topValue: 90,
          roster: [
            { playerId: joppe, startingValue: 90 },
            { playerId: jim, startingValue: 89 },
            { playerId: maurice, startingValue: 88 },
            { playerId: sebastian, startingValue: 87 },
          ],
        },
      });
      seasonId = seasonRes.json().id;

      const round1Res = await app.inject({
        method: 'POST',
        url: `/api/admin/seasons/${seasonId}/rounds`,
        headers: { cookie },
        payload: { number: 1, date: '2026-01-05', signedUpPlayerIds: playerIds },
      });
      const round1 = round1Res.json();
      for (const game of round1.entries) {
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/rounds/${round1.id}/entries/${game.id}`,
          headers: { cookie },
          payload: { result: 'WHITE_WIN' },
        });
      }
      await app.inject({ method: 'POST', url: `/api/admin/rounds/${round1.id}/publish`, headers: { cookie } });

      const round2Res = await app.inject({
        method: 'POST',
        url: `/api/admin/seasons/${seasonId}/rounds`,
        headers: { cookie },
        payload: { number: 2, date: '2026-01-12', signedUpPlayerIds: playerIds },
      });
      const round2 = round2Res.json();
      for (const [idx, game] of round2.entries.entries()) {
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/rounds/${round2.id}/entries/${game.id}`,
          headers: { cookie },
          payload: { result: idx % 2 === 0 ? 'BLACK_WIN' : 'DRAW' },
        });
      }
      await app.inject({ method: 'POST', url: `/api/admin/rounds/${round2.id}/publish`, headers: { cookie } });

      const before = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
      expect(before.statusCode).toBe(200);

      // Export, then wipe and reimport verbatim.
      const backupRes = await app.inject({
        method: 'GET',
        url: `/api/admin/seasons/${seasonId}/backup`,
        headers: { cookie },
      });
      expect(backupRes.statusCode).toBe(200);
      const backup = backupRes.json();

      const importRes = await app.inject({
        method: 'POST',
        url: `/api/admin/backup/import?seasonId=${seasonId}`,
        headers: { cookie },
        payload: backup,
      });
      expect(importRes.statusCode).toBe(200);

      const after = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
      expect(after.json()).toEqual(before.json());
    },
    30_000,
  );
});
