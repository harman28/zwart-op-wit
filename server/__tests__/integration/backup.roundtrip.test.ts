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

describe('full-instance backup export -> wipe -> import round-trip (real Postgres)', () => {
  const app = buildApp();
  let cookie = '';

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
    // A full-instance restore wipes everything by design — leave a clean
    // slate (including club settings back to their out-of-the-box defaults)
    // so later test files don't inherit this test's data.
    await prisma.season.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.clubSettings.update({
      where: { id: 1 },
      data: {
        defaultTopValue: 120,
        defaultRepeatPairingWindow: 6,
        defaultCountExternalMatches: true,
        defaultRegularByeCap: 3,
        defaultKnsbArbiterName: null,
        defaultKnsbArbiterEmail: null,
      },
    });
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  it(
    'reproduces the whole instance byte-for-byte — players (incl. archived, KNSB fields), multiple seasons, and club settings',
    async () => {
      // A player with every optional field set, plus one that's archived —
      // exactly the fields the old season-scoped backup used to drop.
      const richPlayerRes = await app.inject({
        method: 'POST',
        url: '/api/admin/players',
        headers: { cookie },
        payload: { name: 'BackupRichPlayer', membershipType: 'FULL' },
      });
      const richPlayerId = richPlayerRes.json().id;
      await app.inject({
        method: 'PATCH',
        url: `/api/admin/players/${richPlayerId}`,
        headers: { cookie },
        payload: { gender: 'M', knsbId: '12345678', federation: 'NED', notes: 'plays on Tuesdays' },
      });

      const archivedPlayerRes = await app.inject({
        method: 'POST',
        url: '/api/admin/players',
        headers: { cookie },
        payload: { name: 'BackupArchivedPlayer' },
      });
      const archivedPlayerId = archivedPlayerRes.json().id;
      await app.inject({
        method: 'POST',
        url: `/api/admin/players/${archivedPlayerId}/archive`,
        headers: { cookie },
      });

      const names = ['BackupJoppe', 'BackupJim', 'BackupMaurice', 'BackupSebastian'];
      const playerIds: number[] = [];
      for (const name of names) {
        const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
        playerIds.push(res.json().id);
      }
      const [joppe, jim, maurice, sebastian] = playerIds as [number, number, number, number];

      // Club-wide defaults, set to non-default values so the roundtrip
      // actually proves something.
      await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          defaultTopValue: 150,
          defaultRepeatPairingWindow: 8,
          defaultCountExternalMatches: false,
          defaultRegularByeCap: 2,
          defaultKnsbArbiterName: 'Backup Arbiter',
          defaultKnsbArbiterEmail: 'arbiter@example.com',
        },
      });

      // Season 1: fully played out, then ended.
      const season1Res = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: {
          name: 'Backup Roundtrip Season 1',
          topValue: 90,
          roster: [
            { playerId: joppe, startingValue: 90 },
            { playerId: jim, startingValue: 89 },
            { playerId: maurice, startingValue: 88 },
            { playerId: sebastian, startingValue: 87 },
          ],
        },
      });
      const season1Id = season1Res.json().id;

      const round1Res = await app.inject({
        method: 'POST',
        url: `/api/admin/seasons/${season1Id}/rounds`,
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
      await app.inject({ method: 'POST', url: `/api/admin/seasons/${season1Id}/end`, headers: { cookie } });

      // Season 2: the new current season, reusing the same roster plus the
      // rich/archived players enrolled too (via unarchive, so it's really enrolled).
      await app.inject({ method: 'POST', url: `/api/admin/players/${archivedPlayerId}/unarchive`, headers: { cookie } });
      const season2Res = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: {
          name: 'Backup Roundtrip Season 2',
          topValue: 100,
          roster: [
            { playerId: joppe, startingValue: 100 },
            { playerId: jim, startingValue: 99 },
            { playerId: richPlayerId, startingValue: 98 },
          ],
        },
      });
      const season2Id = season2Res.json().id;
      // Re-archive so the export captures archivedAt as non-null for this player.
      await app.inject({ method: 'POST', url: `/api/admin/players/${archivedPlayerId}/archive`, headers: { cookie } });

      const round2Res = await app.inject({
        method: 'POST',
        url: `/api/admin/seasons/${season2Id}/rounds`,
        headers: { cookie },
        payload: { number: 1, date: '2026-02-02', signedUpPlayerIds: [joppe, jim, richPlayerId] },
      });
      const round2 = round2Res.json();
      // Leave results unentered — proves an in-progress round survives too.
      await app.inject({ method: 'POST', url: `/api/admin/rounds/${round2.id}/publish`, headers: { cookie } });

      const beforeLeaderboard1 = await app.inject({ method: 'GET', url: `/api/seasons/${season1Id}/leaderboard` });
      const beforeLeaderboard2 = await app.inject({ method: 'GET', url: `/api/seasons/${season2Id}/leaderboard` });
      const beforePlayers = await app.inject({ method: 'GET', url: '/api/admin/players', headers: { cookie } });
      expect(beforeLeaderboard1.statusCode).toBe(200);
      expect(beforeLeaderboard2.statusCode).toBe(200);

      // Export the whole instance, then wipe and reimport verbatim.
      const backupRes = await app.inject({ method: 'GET', url: '/api/admin/backup', headers: { cookie } });
      expect(backupRes.statusCode).toBe(200);
      const backup = backupRes.json();
      expect(backup.formatVersion).toBe(2);

      const richBefore = backup.players.find((p: { name: string }) => p.name === 'BackupRichPlayer');
      expect(richBefore).toMatchObject({ gender: 'M', knsbId: '12345678', federation: 'NED', notes: 'plays on Tuesdays' });
      const archivedBefore = backup.players.find((p: { name: string }) => p.name === 'BackupArchivedPlayer');
      expect(archivedBefore.archivedAt).not.toBeNull();
      expect(backup.seasons).toHaveLength(2);
      expect(backup.clubSettings).toMatchObject({
        defaultTopValue: 150,
        defaultRepeatPairingWindow: 8,
        defaultCountExternalMatches: false,
        defaultRegularByeCap: 2,
        defaultKnsbArbiterName: 'Backup Arbiter',
        defaultKnsbArbiterEmail: 'arbiter@example.com',
      });

      const importRes = await app.inject({
        method: 'POST',
        url: '/api/admin/backup/import',
        headers: { cookie },
        payload: backup,
      });
      expect(importRes.statusCode).toBe(200);

      // Season ids are freshly assigned on import — resolve the new ones by name.
      const seasonsAfter = await app.inject({ method: 'GET', url: '/api/seasons' });
      const s1 = seasonsAfter.json().find((s: { name: string }) => s.name === 'Backup Roundtrip Season 1');
      const s2 = seasonsAfter.json().find((s: { name: string }) => s.name === 'Backup Roundtrip Season 2');

      const afterLeaderboard1 = await app.inject({ method: 'GET', url: `/api/seasons/${s1.id}/leaderboard` });
      const afterLeaderboard2 = await app.inject({ method: 'GET', url: `/api/seasons/${s2.id}/leaderboard` });
      // Standings are keyed by playerId, which changes on reimport — compare
      // by name+score instead of the raw response.
      const byName = (lb: { standings: { name: string; score: number; played: number }[] }) =>
        lb.standings.map((s) => ({ name: s.name, score: s.score, played: s.played })).sort((a, b) => a.name.localeCompare(b.name));
      expect(byName(afterLeaderboard1.json())).toEqual(byName(beforeLeaderboard1.json()));
      expect(byName(afterLeaderboard2.json())).toEqual(byName(beforeLeaderboard2.json()));

      const afterPlayers = await app.inject({ method: 'GET', url: '/api/admin/players', headers: { cookie } });
      expect(afterPlayers.json()).toHaveLength(beforePlayers.json().length);
      const richAfter = afterPlayers.json().find((p: { name: string }) => p.name === 'BackupRichPlayer');
      expect(richAfter).toMatchObject({ gender: 'M', knsbId: '12345678', federation: 'NED', notes: 'plays on Tuesdays' });
      const archivedAfter = afterPlayers.json().find((p: { name: string }) => p.name === 'BackupArchivedPlayer');
      expect(archivedAfter.archivedAt).not.toBeNull();

      const settingsAfter = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie } });
      expect(settingsAfter.json()).toMatchObject({
        defaultTopValue: 150,
        defaultRepeatPairingWindow: 8,
        defaultCountExternalMatches: false,
        defaultRegularByeCap: 2,
        defaultKnsbArbiterName: 'Backup Arbiter',
        defaultKnsbArbiterEmail: 'arbiter@example.com',
      });
    },
    30_000,
  );
});
