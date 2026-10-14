import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { env } from '../../src/env.js';
import { ensureClubSettings, migrateDuesStatus } from '../../src/modules/auth/auth.service.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error('no set-cookie header in response');
  return header.split(';')[0]!;
}

describe('duesStatus (real Postgres)', () => {
  const app = buildApp();
  let cookie = '';
  const createdPlayerIds: number[] = [];

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
    for (const id of createdPlayerIds) await prisma.player.delete({ where: { id } }).catch(() => {});
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  it('defaults a new player to UNPAID and accepts all three statuses via PATCH', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'DuesStatusAlice' },
    });
    expect(createRes.statusCode).toBe(201);
    const playerId = createRes.json().id as number;
    createdPlayerIds.push(playerId);
    expect(createRes.json().duesStatus).toBe('UNPAID');

    for (const status of ['REQUEST_SENT', 'PAID', 'UNPAID']) {
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/players/${playerId}`,
        headers: { cookie },
        payload: { duesStatus: status },
      });
      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().duesStatus).toBe(status);
    }
  });

  it('rejects an unknown dues status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'DuesStatusBob' },
    });
    const playerId = createRes.json().id as number;
    createdPlayerIds.push(playerId);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/players/${playerId}`,
      headers: { cookie },
      payload: { duesStatus: 'OVERDUE' },
    });
    expect(patchRes.statusCode).toBe(400);
  });

  /**
   * migrateDuesStatus (auth.service.ts) carries over the pre-tri-state
   * duesPaid boolean on an existing database's first boot after duesStatus
   * was introduced — see the comment on migrateDuesStatus itself for why
   * it's safe to call on every boot (it neutralizes duesPaid as it goes, so
   * it can never re-fire for a row it's already migrated).
   */
  it('migrateDuesStatus carries duesPaid=true over to PAID exactly once, never reverting a later explicit UNPAID', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'DuesStatusCarol' },
    });
    const playerId = createRes.json().id as number;
    createdPlayerIds.push(playerId);

    // Simulate a pre-migration row: duesPaid=true from the old boolean flag,
    // duesStatus still at its fresh-column default.
    await prisma.player.update({ where: { id: playerId }, data: { duesPaid: true } });

    await migrateDuesStatus();
    const afterFirstRun = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    expect(afterFirstRun.duesStatus).toBe('PAID');
    expect(afterFirstRun.duesPaid).toBe(false);

    // An admin now explicitly sets them back to UNPAID through the real API.
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/players/${playerId}`,
      headers: { cookie },
      payload: { duesStatus: 'UNPAID' },
    });

    // A later boot (migrateDuesStatus runs on every startup) must not
    // resurrect the old PAID value — duesPaid was already neutralized above.
    await migrateDuesStatus();
    const afterSecondRun = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    expect(afterSecondRun.duesStatus).toBe('UNPAID');
  });
});
