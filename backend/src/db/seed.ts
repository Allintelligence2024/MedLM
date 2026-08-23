/// Seed MVP — données PostgreSQL réelles, déterministes et idempotentes.
///
/// Garanties :
///   * échoue explicitement si DATABASE_URL manque ;
///   * échoue explicitement si le schéma ou les tables attendues manquent ;
///   * versionné via `seed_versions` ;
///   * transactionnel (BEGIN / COMMIT / ROLLBACK) ;
///   * idempotent : rejouer ne crée pas de doublon ;
///   • déterministe : UUIDs fixes, données figées.
import 'dotenv/config';
import { Pool } from 'pg';

const SEED_VERSION = 1;

const REQUIRED_TABLES = [
  'users',
  'programmes',
  'modules',
  'decks',
  'cards',
  'card_versions',
  'entitlements',
  'review_logs',
  'srs_card_state',
  'study_sessions',
  'sync_cursors',
  'refresh_tokens',
  'user_devices',
  'promo_codes',
  'card_reports',
  'webhook_events',
  'audit_log',
  'exam_attempts',
  'exam_questions',
  'exam_answers',
  'exam_templates',
  'exam_attempt_events',
  'leaderboard_optin',
  'user_xp_snapshot',
  'badge_unlocks',
  'deck_key_wrapped',
  'share_cards',
  'group_packs',
  'group_pack_members',
  'tenants',
  'user_tenants',
  'ai_generation_jobs',
  'ai_difficulty_signals',
  'retention_alerts',
  'ai_tutor_prompts',
  'partnerships',
  'device_tokens',
];

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const AUTHOR_ID = '00000000-0000-4000-8000-000000000002';
const STUDENT_ID = '00000000-0000-4000-8000-000000000003';
const PROGRAMME_ID = '00000000-0000-4000-8000-000000000010';
const MODULE_ID = '00000000-0000-4000-8000-000000000020';
const FREE_DECK_ID = '00000000-0000-4000-8000-000000000030';
const PREMIUM_DECK_ID = '00000000-0000-4000-8000-000000000031';
const CARD_IDS = [
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000043',
];

function content(front: string, back: string) {
  return JSON.stringify({ front, back, explanation: 'Seed MedLM' });
}

const CARDS = [
  {
    id: CARD_IDS[0],
    deckId: FREE_DECK_ID,
    type: 'basic',
    status: 'published',
    content: content('Quel est l\'os long du bras ?', 'Humérus'),
    tags: ["anatomie", "membre_superieur"],
    isPremium: false,
    createdBy: AUTHOR_ID,
    reviewedBy: AUTHOR_ID,
  },
  {
    id: CARD_IDS[1],
    deckId: FREE_DECK_ID,
    type: 'basic',
    status: 'published',
    content: content('Combien de côtes chez l\'homme ?', '24'),
    tags: ["anatomie", "thorax"],
    isPremium: false,
    createdBy: AUTHOR_ID,
    reviewedBy: AUTHOR_ID,
  },
  {
    id: CARD_IDS[2],
    deckId: PREMIUM_DECK_ID,
    type: 'basic',
    status: 'published',
    content: content('Quel muscle est l\'abducteur de la hanche ?', 'Gluteus medius'),
    tags: ["anatomie", "membre_inferieur"],
    isPremium: true,
    createdBy: AUTHOR_ID,
    reviewedBy: AUTHOR_ID,
  },
  {
    id: CARD_IDS[3],
    deckId: PREMIUM_DECK_ID,
    type: 'basic',
    status: 'published',
    content: content('Nom du nerf le plus long du corps ?', 'Nerf sciatique'),
    tags: ["anatomie", "neurologie"],
    isPremium: true,
    createdBy: AUTHOR_ID,
    reviewedBy: AUTHOR_ID,
  },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');

  const schema = process.env.PG_SCHEMA || 'public';
  const pool = new Pool({ connectionString: url, max: 1 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schemaCheck = await client.query(
      `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
      [schema],
    );
    if (schemaCheck.rowCount === 0) {
      throw new Error(`Schéma "${schema}" introuvable`);
    }

    await client.query(`SET search_path TO "${schema}"`);

    const tablesResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema],
    );
    const existing = new Set(tablesResult.rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
    if (missing.length > 0) {
      throw new Error(`Tables attendues manquantes : ${missing.join(', ')}`);
    }

    await client.query(`CREATE TABLE IF NOT EXISTS seed_versions (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const already = await client.query(
      'SELECT version FROM seed_versions WHERE version = $1',
      [SEED_VERSION],
    );
    if ((already.rowCount ?? 0) > 0) {
      // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
      console.log(`seed v${SEED_VERSION} déjà appliqué (idempotent)`);
      await client.query('COMMIT');
      return;
    }

    // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
    console.log('seed en cours…');

    await client.query(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,now(),now())
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         rbac_role = EXCLUDED.rbac_role,
         lang_pref = EXCLUDED.lang_pref`,
      [ADMIN_ID, 'admin@medlm.dz', 'Admin MedLM', 'admin', 'fr'],
    );

    await client.query(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,now(),now())
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         rbac_role = EXCLUDED.rbac_role,
         lang_pref = EXCLUDED.lang_pref`,
      [AUTHOR_ID, 'author@medlm.dz', 'Auteur MedLM', 'author', 'fr'],
    );

    await client.query(
      `INSERT INTO users (id, email, display_name, rbac_role, lang_pref, created_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,now(),now())
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         rbac_role = EXCLUDED.rbac_role,
         lang_pref = EXCLUDED.lang_pref`,
      [STUDENT_ID, 'student@medlm.dz', 'Etudiant MedLM', 'student', 'fr'],
    );

    await client.query(
      `INSERT INTO programmes (id, name_fr, name_en, country, study_year)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [PROGRAMME_ID, 'Médecine', 'Medicine', 'DZ', 1],
    );

    await client.query(
      `INSERT INTO modules (id, programme_id, name_fr, name_en, order_index, is_premium)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [MODULE_ID, PROGRAMME_ID, 'Anatomie', 'Anatomy', 1, true],
    );

    await client.query(
      `INSERT INTO decks (id, module_id, name_fr, name_en, description_fr, is_premium, version, card_count, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (id) DO NOTHING`,
      [FREE_DECK_ID, MODULE_ID, 'Anatomie - Gratuit', 'Anatomy - Free', 'Deck gratuit', false, 1, 2],
    );

    await client.query(
      `INSERT INTO decks (id, module_id, name_fr, name_en, description_fr, is_premium, version, card_count, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (id) DO NOTHING`,
      [PREMIUM_DECK_ID, MODULE_ID, 'Anatomie - Premium', 'Anatomy - Premium', 'Deck premium', true, 1, 2],
    );

    for (const card of CARDS) {
      await client.query(
        `INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_by, reviewed_by, published_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now(),now())
         ON CONFLICT (id) DO NOTHING`,
        [
          card.id,
          card.deckId,
          card.type,
          card.status,
          1,
          card.content,
          JSON.stringify({ source_type: 'seed', faculty: 'Oran', year: 2026 }),
          card.tags,
          card.isPremium,
          card.createdBy,
          card.reviewedBy,
        ],
      );

      await client.query(
        `INSERT INTO card_versions (card_id, version, content_snapshot, changed_by, changed_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (card_id, version) DO NOTHING`,
        [card.id, 1, card.content, card.createdBy],
      );
    }

    await client.query(
      `INSERT INTO entitlements (id, user_id, plan, starts_at, expires_at, grace_until)
       VALUES ($1,$2,$3,now(),null,null)
       ON CONFLICT (user_id, plan) DO UPDATE SET
         starts_at = EXCLUDED.starts_at,
         expires_at = EXCLUDED.expires_at,
         grace_until = EXCLUDED.grace_until`,
      [
        '00000000-0000-4000-8000-000000000050',
        STUDENT_ID,
        'premium',
      ],
    );

    await client.query(
      `INSERT INTO seed_versions (version, applied_at) VALUES ($1, now())`,
      [SEED_VERSION],
    );

    // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
    console.log('seed OK');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // eslint-disable-next-line no-console -- CLI : stderr est le canal prévu
    console.error('seed échoué', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const isEntrypoint =
  require.main === module ||
  process.argv[1]?.endsWith('seed.ts') === true ||
  process.argv[1]?.endsWith('seed.js') === true;

if (isEntrypoint) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- CLI : stderr est le canal prévu
    console.error('seed échoué', err);
    process.exit(1);
  });
}
