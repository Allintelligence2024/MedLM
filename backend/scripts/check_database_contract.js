#!/usr/bin/env node
/// Contrat PostgreSQL MVP — vérifications réelles (Node.js, cross-platform).
///
/// PRÉREQUIS :
///   DATABASE_URL      URL PostgreSQL (avec droits DDL/DML)
///   PG_SCHEMA         Schéma cible (défaut: public)
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL manquante');
  process.exit(1);
}

const SCHEMA = process.env.PG_SCHEMA || 'public';

let pool;
try {
  const url = new URL(DATABASE_URL);
  pool = new Pool({
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: url.username,
    password: url.password,
    database: url.pathname.replace(/^\//, ''),
  });
} catch {
  pool = new Pool({ connectionString: DATABASE_URL });
}

let FAIL = 0;
function ko(msg) {
  console.error('  ❌ ' + msg);
  FAIL += 1;
}
function ok(msg) {
  console.log('  ✓ ' + msg);
}

async function main() {
  const client = await pool.connect();
  try {
    const safeSchema = SCHEMA.replace(/"/g, '""');
    await client.query('SET search_path TO "' + safeSchema + '"');

    // 1. 37 tables
    const tablesRes = await client.query(
      `SELECT count(*) AS cnt
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [SCHEMA],
    );
    const tablesCount = Number(tablesRes.rows[0].cnt);
    if (tablesCount >= 37) {
      ok('≥37 tables présentes (' + tablesCount + ')');
    } else {
      ko('37 tables attendues, ' + tablesCount + ' trouvées');
    }

    // 2. Utilisateurs seedés
    for (const email of ['admin@medlm.dz', 'author@medlm.dz', 'student@medlm.dz']) {
      try {
        const res = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
        if (res.rowCount > 0) {
          ok('utilisateur seedé : ' + email);
        } else {
          ko('utilisateur manquant : ' + email);
        }
      } catch (err) {
        ko('utilisateur manquant : ' + email);
      }
    }

    // 3. Rôles
    for (const role of ['admin', 'author', 'student']) {
      try {
        const res = await client.query('SELECT 1 FROM users WHERE rbac_role = $1', [role]);
        if (res.rowCount > 0) {
          ok('rôle présent : ' + role);
        } else {
          ko('rôle manquant : ' + role);
        }
      } catch (err) {
        ko('rôle manquant : ' + role);
      }
    }

    // 4. Decks gratuit et premium
    try {
      const freeDeck = await client.query(
        'SELECT 1 FROM decks WHERE is_premium = false AND published_at IS NOT NULL',
      );
      if (freeDeck.rowCount > 0) {
        ok('deck gratuit publié');
      } else {
        ko('deck gratuit publié manquant');
      }
    } catch (err) {
      ko('deck gratuit publié manquant');
    }

    try {
      const premiumDeck = await client.query(
        'SELECT 1 FROM decks WHERE is_premium = true AND published_at IS NOT NULL',
      );
      if (premiumDeck.rowCount > 0) {
        ok('deck premium publié');
      } else {
        ko('deck premium publié manquant');
      }
    } catch (err) {
      ko('deck premium publié manquant');
    }

    // 5. Cartes publiées
    try {
      const cardRes = await client.query("SELECT count(*) AS cnt FROM cards WHERE status = 'published'");
      const cardCount = Number(cardRes.rows[0].cnt);
      if (cardCount >= 1) {
        ok('cartes publiées : ' + cardCount);
      } else {
        ko('cartes publiées manquantes');
      }
    } catch (err) {
      ko('cartes publiées manquantes');
    }

    // 6. Entitlement premium actif
    try {
      const entRes = await client.query(
        `SELECT 1 FROM entitlements
         WHERE plan = 'premium'
           AND (expires_at IS NULL OR expires_at > now())`,
      );
      if (entRes.rowCount > 0) {
        ok('entitlement premium actif');
      } else {
        ko('entitlement premium actif manquant');
      }
    } catch (err) {
      ko('entitlement premium actif manquant');
    }

    // 7. Clés étrangères
    const fkRes = await client.query(
      `SELECT count(*) AS cnt
       FROM pg_constraint
       WHERE contype = 'f'
         AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)`,
      [SCHEMA],
    );
    const fkCount = Number(fkRes.rows[0].cnt);
    if (fkCount >= 20) {
      ok('clés étrangères présentes : ' + fkCount);
    } else {
      ko('clés étrangères insuffisantes : ' + fkCount + ' (< 20 attendu)');
    }

    // 8. Contraintes CHECK
    const ckRes = await client.query(
      `SELECT count(*) AS cnt
       FROM pg_constraint
       WHERE contype = 'c'
         AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)`,
      [SCHEMA],
    );
    const ckCount = Number(ckRes.rows[0].cnt);
    if (ckCount >= 10) {
      ok('contraintes CHECK présentes : ' + ckCount);
    } else {
      ko('contraintes CHECK insuffisantes : ' + ckCount + ' (< 10 attendu)');
    }

    // 9. Rejet d'un rating invalide
    try {
      await client.query(
        `INSERT INTO review_logs (id, user_id, card_id, device_id, rating, duration_ms, card_type, exam_mode, reviewed_at, received_at)
         VALUES ('ff000000-0000-4000-8000-000000000099', (SELECT id FROM users LIMIT 1), (SELECT id FROM cards LIMIT 1), 'dev', 5, 0, 'basic', false, 1, now())`,
      );
      ko("rating invalide (5) accepté — CHECK manquant");
    } catch (err) {
      ok('rating invalide (5) rejeté');
    }

    // 10. Rejet d'un deck orphelin (FK)
    try {
      await client.query(
        `INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_at, updated_at)
         VALUES ('ff000000-0000-4000-8000-000000000099', 'ff000000-0000-4000-8000-000000000099', 'basic', 'published', 1, '{}', '{}', '{}', false, now(), now())`,
      );
      ko('deck orphelin accepté — FK manquante');
    } catch (err) {
      ok('deck orphelin rejeté (FK)');
    }

    // 11. Append-only review_logs
    const rlRes = await client.query('SELECT id FROM review_logs LIMIT 1');
    if (rlRes.rowCount > 0) {
      const rlId = rlRes.rows[0].id;
      try {
        await client.query('UPDATE review_logs SET duration_ms = 1 WHERE id = $1', [rlId]);
        ko('review_logs autorise UPDATE — trigger manquant');
      } catch (err) {
        ok('review_logs append-only (UPDATE refusé)');
      }
    } else {
      console.log('  ℹ aucun review_log pour tester l\'append-only');
    }

    console.log();
    if (FAIL === 0) {
      console.log('✅ Contrat PostgreSQL MVP : tout passe.');
      process.exit(0);
    } else {
      console.error('❌ Contrat PostgreSQL MVP : ' + FAIL + ' échec(s).');
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('contrat échoué', err);
  process.exit(1);
});
