import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { env } from '../../src/env.js';
import { ensureClubSettings } from '../../src/modules/auth/auth.service.js';

// PNGs always start with this 8-byte signature — a cheap, reliable way to
// confirm satori/resvg actually produced an image without snapshotting pixels.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error('no set-cookie header in response');
  return header.split(';')[0]!;
}

// Only the player share image is covered here with real HTTP requests — it's
// pure DB + engine data, no network dependency. The external-team share image
// (teamShareImage.ts) additionally needs a live netstand division-standings
// fetch (same as the rest of externalTeams.service.ts), which isn't reachable
// from this sandbox's test environment either — see netstandDivisionScrape's
// own tests for coverage of the scrape/parse logic it depends on, and this
// repo's established pattern of the analogous round share image
// (rounds/shareImage.ts) also having no dedicated test of its own.
describe('player share image (real Postgres)', () => {
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

  it('renders a real PNG for an enrolled player', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'ShareImageTestPlayer' },
    });
    expect(res.statusCode).toBe(201);
    const playerId = res.json().id;
    createdPlayerIds.push(playerId);

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Share Image Test Season',
        topValue: 100,
        repeatPairingWindow: 6,
        roster: [{ playerId, startingValue: 100 }],
      },
    });
    expect(seasonRes.statusCode).toBe(201);
    seasonId = seasonRes.json().id;

    const imageRes = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/players/${playerId}/share-image.png` });
    expect(imageRes.statusCode).toBe(200);
    expect(imageRes.headers['content-type']).toBe('image/png');
    expect(imageRes.rawPayload.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it('404s for a player not enrolled in the season', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'ShareImageUnenrolledPlayer' },
    });
    expect(res.statusCode).toBe(201);
    const unenrolledId = res.json().id;
    createdPlayerIds.push(unenrolledId);

    const imageRes = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/players/${unenrolledId}/share-image.png` });
    expect(imageRes.statusCode).toBe(404);
  });
});
