/// Contrat PostgreSQL MVP — preuve d'exécution réelle.
///
/// Ce test utilise PGlite (PostgreSQL compilé en WASM) pour exécuter
/// les migrations SQL et le seed contre un vrai moteur PostgreSQL.
/// Ce n'est PAS un fake Drizzle : PGlite est le code source de PostgreSQL
/// compilé via Emscripten — toutes les contraintes, triggers et FK sont
/// réellement évalués par le moteur PostgreSQL.
///
/// Note : PGlite (PostgreSQL 18 WASM) n'inclut pas l'extension pgcrypto
/// car gen_random_uuid() est natif depuis PostgreSQL 13. La migration
/// 0018_mvp_integrity.sql contient `CREATE EXTENSION IF NOT EXISTS pgcrypto`
/// qui est retirée ici (safety check, pas critique).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../src/db/migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta', '_journal.json');

function readJournal() {
  const raw = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
  return raw.entries as Array<{ idx: number; when: number; tag: string }>;
}

function readMigrationSql(tag: string): string[] {
  const path = join(MIGRATIONS_DIR, `${tag}.sql`);
  const content = readFileSync(path, 'utf8');
  // Retirer les CREATE EXTENSION pgcrypto (non disponible dans PGlite WASM,
  // gen_random_uuid() est natif depuis PostgreSQL 13).
  const cleaned = content.replace(
    /CREATE EXTENSION IF NOT EXISTS pgcrypto;?/g,
    '',
  );
  return cleaned
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applyMigrations(db: PGlite) {
  const journal = readJournal();
  for (const entry of journal) {
    const statements = readMigrationSql(entry.tag);
    for (const stmt of statements) {
      await db.exec(stmt);
    }
  }
}

describe('PostgreSQL MVP Contract — real engine (PGlite)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  // ── 1. Migrations ──────────────────────────────────────────────────────
  it('applique les 18 migrations sans erreur', async () => {
    const journal = readJournal();
    expect(journal).toHaveLength(18);
    await applyMigrations(db);
  }, 120_000);

  it('les migrations idempotentes (CREATE IF NOT EXISTS) peuvent être rejouées', async () => {
    // Les CREATE TABLE IF NOT EXISTS et CREATE INDEX IF NOT EXISTS sont
    // idempotents. Les ALTER TABLE ADD CONSTRAINT de 0018 ne le sont pas
    // — c'est le journal migrate.ts qui garantit la non-réexécution.
    // On vérifie ici que les instructions idempotentes rejouent sans erreur.
    const journal = readJournal();
    for (const entry of journal) {
      const statements = readMigrationSql(entry.tag);
      for (const stmt of statements) {
        // ALTER TABLE ADD CONSTRAINT n'est pas idempotent — on le saute
        // pour ce test. Le vrai idempotisme vient du journal migrate.ts.
        if (stmt.includes('ADD CONSTRAINT')) continue;
        await db.exec(stmt);
      }
    }
  }, 120_000);

  // ── 2. Tables ──────────────────────────────────────────────────────────
  it('crée au moins 37 tables dans le schéma public', async () => {
    const result = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const count = parseInt(result.rows[0]!.cnt, 10);
    expect(count).toBeGreaterThanOrEqual(37);
  });

  // ── 3. Clés étrangères ────────────────────────────────────────────────
  it('possède au moins 20 clés étrangères', async () => {
    const result = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM pg_constraint
       WHERE contype = 'f'
         AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
    );
    const count = parseInt(result.rows[0]!.cnt, 10);
    expect(count).toBeGreaterThanOrEqual(20);
  });

  // ── 4. Contraintes CHECK ──────────────────────────────────────────────
  it('possède au moins 10 contraintes CHECK', async () => {
    const result = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM pg_constraint
       WHERE contype = 'c'
         AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
    );
    const count = parseInt(result.rows[0]!.cnt, 10);
    expect(count).toBeGreaterThanOrEqual(10);
  });

  // ── 5. Seed ────────────────────────────────────────────────────────────
  it('exécute le seed complet (utilisateurs, programme, module, decks, cartes, entitlement)', async () => {
    await db.exec(`CREATE TABLE IF NOT EXISTS seed_versions (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const already = await db.query(
      'SELECT version FROM seed_versions WHERE version = 1',
    );
    if (already.rows.length > 0) {
      const users = await db.query(
        `SELECT email FROM users WHERE email IN ('admin@medlm.dz', 'author@medlm.dz', 'student@medlm.dz') ORDER BY email`,
      );
      expect(users.rows).toHaveLength(3);
      return;
    }

    await db.exec(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ('00000000-0000-4000-8000-000000000001', 'admin@medlm.dz', 'Admin MedLM', 'admin', 'fr', now(), now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, rbac_role = EXCLUDED.rbac_role, lang_pref = EXCLUDED.lang_pref`,
    );
    await db.exec(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ('00000000-0000-4000-8000-000000000002', 'author@medlm.dz', 'Auteur MedLM', 'author', 'fr', now(), now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, rbac_role = EXCLUDED.rbac_role, lang_pref = EXCLUDED.lang_pref`,
    );
    await db.exec(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ('00000000-0000-4000-8000-000000000003', 'student@medlm.dz', 'Etudiant MedLM', 'student', 'fr', now(), now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, rbac_role = EXCLUDED.rbac_role, lang_pref = EXCLUDED.lang_pref`,
    );

    await db.exec(
      `INSERT INTO programmes (id, name_fr, name_en, country, study_year)
       VALUES ('00000000-0000-4000-8000-000000000010', 'Medecine', 'Medicine', 'DZ', 1)
       ON CONFLICT (id) DO NOTHING`,
    );

    await db.exec(
      `INSERT INTO modules (id, programme_id, name_fr, name_en, order_index, is_premium)
       VALUES ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000010', 'Anatomie', 'Anatomy', 1, true)
       ON CONFLICT (id) DO NOTHING`,
    );

    await db.exec(
      `INSERT INTO decks (id, module_id, name_fr, name_en, description_fr, is_premium, version, card_count, published_at)
       VALUES ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000020', 'Anatomie - Gratuit', 'Anatomy - Free', 'Deck gratuit', false, 1, 2, now())
       ON CONFLICT (id) DO NOTHING`,
    );
    await db.exec(
      `INSERT INTO decks (id, module_id, name_fr, name_en, description_fr, is_premium, version, card_count, published_at)
       VALUES ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000020', 'Anatomie - Premium', 'Anatomy - Premium', 'Deck premium', true, 1, 2, now())
       ON CONFLICT (id) DO NOTHING`,
    );

    const cardData = [
      { id: '00000000-0000-4000-8000-000000000040', deckId: '00000000-0000-4000-8000-000000000030', premium: false, tags: '{anatomie,bras}' },
      { id: '00000000-0000-4000-8000-000000000041', deckId: '00000000-0000-4000-8000-000000000030', premium: false, tags: '{anatomie,thorax}' },
      { id: '00000000-0000-4000-8000-000000000042', deckId: '00000000-0000-4000-8000-000000000031', premium: true, tags: '{anatomie,hanche}' },
      { id: '00000000-0000-4000-8000-000000000043', deckId: '00000000-0000-4000-8000-000000000031', premium: true, tags: '{anatomie,neurologie}' },
    ];

    for (const card of cardData) {
      await db.exec(
        `INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_by, reviewed_by, published_at, created_at, updated_at)
         VALUES ('${card.id}', '${card.deckId}', 'basic', 'published', 1,
                 '{"front":"Seed card","back":"Seed answer","explanation":"Seed MedLM"}'::jsonb,
                 '{"source_type":"seed"}'::jsonb,
                 '${card.tags}'::text[],
                 ${card.premium},
                 '00000000-0000-4000-8000-000000000002',
                 '00000000-0000-4000-8000-000000000002',
                 now(), now(), now())
         ON CONFLICT (id) DO NOTHING`,
      );

      await db.exec(
        `INSERT INTO card_versions (card_id, version, content_snapshot, changed_by, changed_at)
         VALUES ('${card.id}', 1, '{"front":"Seed card","back":"Seed answer","explanation":"Seed MedLM"}'::jsonb, '00000000-0000-4000-8000-000000000002', now())
         ON CONFLICT (card_id, version) DO NOTHING`,
      );
    }

    await db.exec(
      `INSERT INTO entitlements (id, user_id, plan, starts_at, expires_at, grace_until)
       VALUES ('00000000-0000-4000-8000-000000000050', '00000000-0000-4000-8000-000000000003', 'premium', now(), null, null)
       ON CONFLICT (user_id, plan) DO UPDATE SET starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at, grace_until = EXCLUDED.grace_until`,
    );

    await db.exec(
      `INSERT INTO seed_versions (version, applied_at) VALUES (1, now())`,
    );

    const users = await db.query(
      `SELECT email FROM users WHERE email IN ('admin@medlm.dz', 'author@medlm.dz', 'student@medlm.dz') ORDER BY email`,
    );
    expect(users.rows).toHaveLength(3);

    const decks = await db.query(
      `SELECT is_premium FROM decks WHERE published_at IS NOT NULL ORDER BY is_premium`,
    );
    expect(decks.rows.length).toBeGreaterThanOrEqual(2);

    const cards = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM cards WHERE status = 'published'`,
    );
    expect(parseInt(cards.rows[0]!.cnt, 10)).toBeGreaterThanOrEqual(4);

    const entitlements = await db.query<{ plan: string }>(
      `SELECT plan FROM entitlements WHERE plan = 'premium' AND (expires_at IS NULL OR expires_at > now())`,
    );
    expect(entitlements.rows.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('réexécute le seed sans doublon (idempotence)', async () => {
    const before = await db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM users`);
    const beforeCount = parseInt(before.rows[0]!.cnt, 10);

    await db.exec(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ('00000000-0000-4000-8000-000000000001', 'admin@medlm.dz', 'Admin MedLM', 'admin', 'fr', now(), now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, rbac_role = EXCLUDED.rbac_role, lang_pref = EXCLUDED.lang_pref`,
    );

    const after = await db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM users`);
    const afterCount = parseInt(after.rows[0]!.cnt, 10);
    expect(afterCount).toBe(beforeCount);
  });

  // ── 6. Rejet d'un rating invalide ─────────────────────────────────────
  it('rejette un rating invalide (5) via CHECK', async () => {
    await expect(
      db.exec(
        `INSERT INTO review_logs (id, user_id, card_id, device_id, rating, duration_ms, card_type, exam_mode, reviewed_at, received_at)
         VALUES ('ff000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000040', 'dev', 5, 0, 'basic', false, 1, now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 7. Rejet d'un deck orphelin (FK) ──────────────────────────────────
  it('rejette une carte avec un deck inexistant (FK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_at, updated_at)
         VALUES ('ff000000-0000-4000-8000-000000000099', 'ff000000-0000-4000-8000-000000000099', 'basic', 'published', 1, '{}'::jsonb, '{}'::jsonb, '{}'::text[], false, now(), now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 8. Append-only review_logs ────────────────────────────────────────
  it('refuse UPDATE sur review_logs (append-only trigger)', async () => {
    await db.exec(
      `INSERT INTO review_logs (id, user_id, card_id, device_id, rating, duration_ms, card_type, exam_mode, reviewed_at, received_at)
       VALUES ('ff000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000040', 'dev', 3, 100, 'basic', false, 1700000000000, now())`,
    );

    await expect(
      db.exec(`UPDATE review_logs SET duration_ms = 999 WHERE id = 'ff000000-0000-4000-8000-000000000001'`),
    ).rejects.toThrow(/append-only/);
  });

  it('refuse DELETE sur review_logs (append-only trigger)', async () => {
    await expect(
      db.exec(`DELETE FROM review_logs WHERE id = 'ff000000-0000-4000-8000-000000000001'`),
    ).rejects.toThrow(/append-only/);
  });

  // ── 9. Append-only ai_tutor_prompts ───────────────────────────────────
  it('refuse UPDATE sur ai_tutor_prompts (append-only trigger)', async () => {
    await db.exec(
      `INSERT INTO ai_tutor_prompts (id, user_id, question, question_hash, lang, provider, model, answer, response_hash, within_scope, emergency, tokens_in, tokens_out)
       VALUES ('ff000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000003', 'Test?', 'hash1', 'fr', 'mock', 'mock-fsm-1', 'Answer.', 'hash2', true, false, 10, 20)`,
    );

    await expect(
      db.exec(`UPDATE ai_tutor_prompts SET answer = 'Modified' WHERE id = 'ff000000-0000-4000-8000-000000000010'`),
    ).rejects.toThrow(/append-only/);
  });

  // ── 10. SRS state no-decrement ────────────────────────────────────────
  it('refuse de diminuer reps dans srs_card_state (trigger no-decrement)', async () => {
    await db.exec(
      `INSERT INTO srs_card_state (user_id, card_id, state, stability, difficulty, reps, lapses)
       VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000040', 'review', 2.5, 0.3, 5, 0)`,
    );

    await expect(
      db.exec(
        `UPDATE srs_card_state SET reps = 3 WHERE user_id = '00000000-0000-4000-8000-000000000003' AND card_id = '00000000-0000-4000-8000-000000000040'`,
      ),
    ).rejects.toThrow(/ne peut pas décroître/);
  });

  // ── 11. Statuts valides pour cards ────────────────────────────────────
  it('rejette un statut de carte invalide (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_at, updated_at)
         VALUES ('ff000000-0000-4000-8000-000000000098', '00000000-0000-4000-8000-000000000030', 'basic', 'invalid_status', 1, '{}'::jsonb, '{}'::jsonb, '{}'::text[], false, now(), now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 12. Rôles RBAC valides ───────────────────────────────────────────
  it('rejette un rôle RBAC invalide (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
         VALUES ('ff000000-0000-4000-8000-000000000097', 'invalid@medlm.dz', 'Invalid', 'hacker', 'fr', now(), now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 13. Plans d'entitlement valides ───────────────────────────────────
  it('rejette un plan entitlement invalide (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO entitlements (id, user_id, plan, starts_at)
         VALUES ('ff000000-0000-4000-8000-000000000096', '00000000-0000-4000-8000-000000000003', 'enterprise', now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 14. États SRS valides ────────────────────────────────────────────
  it('rejette un état SRS invalide (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO srs_card_state (user_id, card_id, state)
         VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000041', 'invalid_state')`,
      ),
    ).rejects.toThrow();
  });

  // ── 15. Types de carte valides ────────────────────────────────────────
  it('rejette un type de carte invalide (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_at, updated_at)
         VALUES ('ff000000-0000-4000-8000-000000000095', '00000000-0000-4000-8000-000000000030', 'video', 'draft', 1, '{}'::jsonb, '{}'::jsonb, '{}'::text[], false, now(), now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 16. Contraintes de domaine ────────────────────────────────────────
  it('rejette study_year hors limites (CHECK 1..6)', async () => {
    await expect(
      db.exec(
        `INSERT INTO programmes (id, name_fr, name_en, country, study_year)
         VALUES ('ff000000-0000-4000-8000-000000000094', 'Test', 'Test', 'DZ', 0)`,
      ),
    ).rejects.toThrow();
  });

  it('rejette decks.version <= 0 (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO decks (id, module_id, name_fr, name_en, description_fr, is_premium, version, card_count, published_at)
         VALUES ('ff000000-0000-4000-8000-000000000093', '00000000-0000-4000-8000-000000000020', 'Bad', 'Bad', '', false, 0, 0, now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 17. Unicité email ────────────────────────────────────────────────
  it('rejette un email en double (UNIQUE)', async () => {
    await expect(
      db.exec(
        `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
         VALUES ('ff000000-0000-4000-8000-000000000092', 'admin@medlm.dz', 'Dup', 'student', 'fr', now(), now())`,
      ),
    ).rejects.toThrow();
  });

  // ── 18. Platform CHECK sur device_tokens ──────────────────────────────
  it('rejette une platform invalide sur device_tokens (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO device_tokens (id, user_id, device_id, token, platform)
         VALUES ('ff000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000003', 'dev1', 'tok1', 'blackberry')`,
      ),
    ).rejects.toThrow();
  });

  // ── 19. Partnership CHECK ─────────────────────────────────────────────
  it('rejette un commission_pct > 50 sur partnerships (CHECK)', async () => {
    await expect(
      db.exec(
        `INSERT INTO partnerships (id, faculty, contact_email, status, scope, commission_pct)
         VALUES ('ff000000-0000-4000-8000-000000000090', 'Test', 'test@test.com', 'draft', '{}', 60)`,
      ),
    ).rejects.toThrow();
  });

  // ── 20. Données seedées complètes ─────────────────────────────────────
  it('vérifie les données seedées : utilisateurs, rôles, programme, module, decks, cartes, entitlement', async () => {
    const users = await db.query(
      `SELECT email, rbac_role FROM users WHERE email IN ('admin@medlm.dz', 'author@medlm.dz', 'student@medlm.dz') ORDER BY email`,
    );
    expect(users.rows).toHaveLength(3);
    expect(users.rows.map((r: any) => r.rbac_role)).toEqual(
      expect.arrayContaining(['admin', 'author', 'student']),
    );

    const prog = await db.query(
      `SELECT name_fr, country FROM programmes WHERE id = '00000000-0000-4000-8000-000000000010'`,
    );
    expect(prog.rows).toHaveLength(1);

    const mod = await db.query(
      `SELECT name_fr FROM modules WHERE id = '00000000-0000-4000-8000-000000000020'`,
    );
    expect(mod.rows).toHaveLength(1);

    const freeDeck = await db.query(
      `SELECT id FROM decks WHERE is_premium = false AND published_at IS NOT NULL`,
    );
    expect(freeDeck.rows.length).toBeGreaterThanOrEqual(1);

    const premiumDeck = await db.query(
      `SELECT id FROM decks WHERE is_premium = true AND published_at IS NOT NULL`,
    );
    expect(premiumDeck.rows.length).toBeGreaterThanOrEqual(1);

    const publishedCards = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM cards WHERE status = 'published' AND published_at IS NOT NULL`,
    );
    expect(parseInt(publishedCards.rows[0]!.cnt, 10)).toBeGreaterThanOrEqual(4);

    const versions = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM card_versions`,
    );
    expect(parseInt(versions.rows[0]!.cnt, 10)).toBeGreaterThanOrEqual(4);

    const entitlement = await db.query<{ plan: string }>(
      `SELECT plan FROM entitlements WHERE user_id = '00000000-0000-4000-8000-000000000003' AND plan = 'premium' AND (expires_at IS NULL OR expires_at > now())`,
    );
    expect(entitlement.rows).toHaveLength(1);

    const seedVer = await db.query(
      `SELECT version FROM seed_versions WHERE version = 1`,
    );
    expect(seedVer.rows).toHaveLength(1);
  });
});
