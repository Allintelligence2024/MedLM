// Phase 4 / R05 — anonymisation, jamais DELETE users avec review_logs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { ErasureService, erasedEmailFor } from '../../src/privacy/erasure.service';
import * as schema from '../../src/db/schema';
import {
  cards,
  decks,
  entitlements,
  modules,
  programmes,
  refreshTokens,
  reviewLogs,
  userDevices,
  users,
} from '../../src/db/schema';
import type { Database } from '../../src/db/database.module';

describe('ErasureService (PGlite)', () => {
  let pg: PGlite;
  let db: Database;
  let erasure: ErasureService;
  const userId = '11111111-1111-4000-8000-000000000001';
  const cardId = '11111111-1111-4000-8000-000000000040';
  const deviceId = '11111111-1111-4000-8000-000000000010';

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    const dir = join(__dirname, '../../src/db/migrations');
    const journal = JSON.parse(
      readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    for (const entry of journal.entries) {
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8').replace(
        /CREATE EXTENSION IF NOT EXISTS pgcrypto;?/g,
        '',
      );
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await pg.exec(statement);
      }
    }
    db = drizzle(pg, { schema }) as unknown as Database;
    erasure = new ErasureService(db);
    await db.insert(users).values({
      id: userId,
      email: 'student@example.dz',
      phone: '+213555000000',
      displayName: 'Étudiant',
      faculty: 'Alger',
    });
    await db.insert(programmes).values({
      id: '11111111-1111-4000-8000-000000000002',
      nameFr: 'Med',
      nameEn: 'Med',
      country: 'DZ',
      studyYear: 1,
    });
    await db.insert(modules).values({
      id: '11111111-1111-4000-8000-000000000003',
      programmeId: '11111111-1111-4000-8000-000000000002',
      nameFr: 'Anat',
      nameEn: 'Anat',
    });
    await db.insert(decks).values({
      id: '11111111-1111-4000-8000-000000000004',
      moduleId: '11111111-1111-4000-8000-000000000003',
      nameFr: 'Deck',
      nameEn: 'Deck',
    });
    await db.insert(cards).values({
      id: cardId,
      deckId: '11111111-1111-4000-8000-000000000004',
      type: 'basic',
      status: 'published',
      content: { front: 'q', back: 'a' },
    });
    await db.insert(userDevices).values({
      id: deviceId,
      userId,
      platform: 'web',
    });
    await db.insert(refreshTokens).values({
      userId,
      deviceId,
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await db.insert(entitlements).values({
      userId,
      plan: 'premium',
    });
    await db.insert(reviewLogs).values({
      id: '11111111-1111-4000-8000-000000000099',
      userId,
      cardId,
      deviceId: 'dev-1',
      rating: 3,
      durationMs: 10,
      reviewedAt: 1_700_000_000_000,
    });
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('anonymise et révoque les sessions sans toucher au journal', async () => {
    await erasure.eraseUser(userId);
    const row = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);
    expect(row?.email).toBe(erasedEmailFor(userId));
    expect(row?.phone).toBeNull();
    expect(row?.displayName).toBeNull();
    const tokens = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
    expect(tokens).toHaveLength(0);
    const devices = await db.select().from(userDevices).where(eq(userDevices.userId, userId));
    expect(devices).toHaveLength(0);
    const plans = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(plans).toHaveLength(0);
    const logs = await db.select().from(reviewLogs).where(eq(reviewLogs.userId, userId));
    expect(logs).toHaveLength(1);
  });

  it('PostgreSQL refuse DELETE users tant que le journal existe', async () => {
    await expect(
      db.delete(users).where(eq(users.id, userId)),
    ).rejects.toThrow();
  });
});
