// PostgreSQL réel — deux connexions, un seul refresh accepté.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../../src/auth/auth.service';
import { type Database } from '../../src/db/database.module';
import * as schema from '../../src/db/schema';
import { users } from '../../src/db/schema';

const url = process.env.BILLING_TEST_DATABASE_URL;
if (process.env.CI && !url) {
  throw new Error('Auth refresh concurrency requires BILLING_TEST_DATABASE_URL in CI');
}
const suite = url ? describe : describe.skip;

suite('Auth — concurrent refresh (PostgreSQL)', () => {
  const namespace = `auth_${randomUUID().replaceAll('-', '')}`;
  let schemaCreated = false;
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let authA: AuthService;
  let authB: AuthService;
  let userId = '';

  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    schemaCreated = true;
    const opts = {
      connectionString: url!,
      max: 1,
      options: `-c search_path=${namespace},public`,
    };
    poolA = new Pool(opts);
    poolB = new Pool({ ...opts });
    const dir = join(__dirname, '../../src/db/migrations');
    const journal = JSON.parse(
      readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    for (const entry of journal.entries) {
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await poolA.query(statement);
      }
    }
    const jwt = new JwtService({ secret: 'phase3-refresh' });
    const config = new ConfigService({
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 2592000,
    });
    authA = new AuthService(drizzle(poolA, { schema }) as unknown as Database, jwt, config);
    authB = new AuthService(drizzle(poolB, { schema }) as unknown as Database, jwt, config);
    const [row] = await drizzle(poolA, { schema })
      .insert(users)
      .values({ email: `${randomUUID()}@refresh.invalid` })
      .returning({ id: users.id });
    userId = row!.id;
  });

  afterAll(async () => {
    await poolA?.end();
    await poolB?.end();
    if (schemaCreated) {
      await admin.query(`DROP SCHEMA "${namespace}" CASCADE`);
    }
    await admin?.end();
  });

  it('un seul concurrent gagne ; le replay révoque la famille', async () => {
    const issued = await authA.issueFullSession({
      userId,
      platform: 'ios',
      deviceToken: 'phone-1',
    });
    const results = await Promise.allSettled([
      authA.refresh({ refreshToken: issued.refresh_token, platform: 'ios' }),
      authB.refresh({ refreshToken: issued.refresh_token, platform: 'ios' }),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const winner = (won[0] as PromiseFulfilledResult<{ refresh_token: string }>).value;
    const replay = await Promise.allSettled([
      authA.refresh({ refreshToken: issued.refresh_token, platform: 'ios' }),
      authB.refresh({ refreshToken: issued.refresh_token, platform: 'ios' }),
    ]);
    expect(replay.every((r) => r.status === 'rejected')).toBe(true);
    const next = await authA.refresh({
      refreshToken: winner.refresh_token,
      platform: 'ios',
    });
    expect(next.access_token).toBeTruthy();
  });
});
