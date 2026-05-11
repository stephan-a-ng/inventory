import { test as base } from '@playwright/test';
import { SignJWT } from 'jose';
import { Client } from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5451/inventory_test';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-e2e';

if (!TEST_DATABASE_URL.includes('inventory_test')) {
  throw new Error('Refusing to run e2e against a non-test DB');
}

/**
 * Mint a JWT signed with the same algorithm + secret the backend uses
 * (HS256 over an opaque secret read from `JWT_SECRET`).
 */
async function mintJwt(userId, email, role) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const oneWeekFromNow = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  return await new SignJWT({ sub: userId, email, role, iat: Math.floor(Date.now() / 1000) })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(oneWeekFromNow)
    .sign(secret);
}

/**
 * Truncate the mutable tables before each test and seed a single admin user.
 * Returns the user row + JWT.
 */
export async function resetDbAndSeedUser(role = 'admin') {
  const pg = new Client({ connectionString: TEST_DATABASE_URL });
  await pg.connect();
  try {
    await pg.query(
      'TRUNCATE inventory.audit_log, inventory.board_revisions, inventory.devices, inventory.users RESTART IDENTITY CASCADE',
    );
    const { rows } = await pg.query(
      `INSERT INTO inventory.users (email, name, role)
       VALUES ($1, $2, $3) RETURNING id, email, name, role`,
      [`e2e-${role}@moonfive.tech`, 'E2E Tester', role],
    );
    const user = rows[0];
    const token = await mintJwt(user.id, user.email, user.role);
    return { user, token };
  } finally {
    await pg.end();
  }
}

/**
 * Auth fixture: drops a signed `auth_token` cookie before the page loads so
 * the AuthGate sees the user as logged in without going through real Google
 * OAuth.
 */
export const test = base.extend({
  authedPage: async ({ page, context }, use) => {
    const { user, token } = await resetDbAndSeedUser('admin');
    await context.addCookies([
      {
        name: 'auth_token',
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    // Expose the seeded user so specs can reference it.
    page.testUser = user;
    await use(page);
  },
});

export { expect } from '@playwright/test';
