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

describe('auth routes (real Postgres)', () => {
  const app = buildApp();

  beforeAll(async () => {
    await ensureClubSettings();
  });

  afterAll(async () => {
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects an incorrect password', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'definitely-wrong' } });
    expect(res.statusCode).toBe(401);
  });

  it('without a session cookie, /session reports isAdmin:false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(res.json()).toEqual({ isAdmin: false });
  });

  it('requireAdmin blocks unauthenticated requests to an admin-only route', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: 'x', newPassword: 'y' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('logs in with the correct password, session reflects it, logout invalidates it', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: env.ADMIN_INITIAL_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookie = extractCookie(loginRes.headers['set-cookie']);

    const sessionRes = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(sessionRes.json()).toEqual({ isAdmin: true });

    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const afterLogout = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(afterLogout.json()).toEqual({ isAdmin: false });
  });

  it('change-password rejects the wrong current password, accepts the right one, and signs out other sessions', async () => {
    const loginA = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: env.ADMIN_INITIAL_PASSWORD },
    });
    const cookieA = extractCookie(loginA.headers['set-cookie']);
    const loginB = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: env.ADMIN_INITIAL_PASSWORD },
    });
    const cookieB = extractCookie(loginB.headers['set-cookie']);

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: cookieA },
      payload: { currentPassword: 'nope', newPassword: 'temporary-test-password' },
    });
    expect(wrong.statusCode).toBe(401);

    const right = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: cookieA },
      payload: { currentPassword: env.ADMIN_INITIAL_PASSWORD, newPassword: 'temporary-test-password' },
    });
    expect(right.statusCode).toBe(200);

    const sessionA = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: cookieA } });
    expect(sessionA.json()).toEqual({ isAdmin: true });

    const sessionB = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: cookieB } });
    expect(sessionB.json()).toEqual({ isAdmin: false });

    // restore the original password so re-runs and other tests are unaffected
    await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: cookieA },
      payload: { currentPassword: 'temporary-test-password', newPassword: env.ADMIN_INITIAL_PASSWORD },
    });
  });
});
