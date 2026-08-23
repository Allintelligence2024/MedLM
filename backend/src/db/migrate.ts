/// Script de migration — applique les migrations Drizzle au démarrage.
///
/// ATTENTION : ce fichier N'exécute la migration que s'il est le point
/// d'entrée du processus (cf. `isEntrypoint` en bas). L'importer pour
/// réutiliser `resolveMigrationsFolder` est donc sans effet de bord.
///
/// Utilisé :
///   * en CI, pour provisionner la base Neon avant les tests ;
///   * en production, comme point d'entrée du release ;
///   * en local, via `npm run db:migrate`.
///
/// Important : le migrator embarqué de drizzle ne permet pas de imposer
/// un `search_path` sur la connexion utilisée pour exécuter les SQL.
/// On utilise donc un runner maison qui :
///   * ouvre une connexion brute ;
///   * bascule vers le schéma cible ;
///   * exécute chaque fichier de migration dans une transaction ;
///   * enregistre les migrations appliquées dans `drizzle.__drizzle_migrations`.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import crypto from 'node:crypto';

export function resolveMigrationsFolder(
  candidates: string[] = [
    process.env.MIGRATIONS_DIR ?? '',
    './src/db/migrations', // dev : tsx depuis backend/
    './dist/db/migrations', // image Docker : WORKDIR /app
    resolve(__dirname, 'migrations'), // exécution depuis dist/db/
  ],
): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (existsSync(resolve(candidate, 'meta', '_journal.json'))) {
      return candidate;
    }
  }
  throw new Error(
    'Dossier de migrations introuvable. Emplacements sondés : ' +
      candidates.filter(Boolean).join(', ') +
      '. Définir MIGRATIONS_DIR si le déploiement les range ailleurs.',
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');

  const schemaName = process.env.PG_SCHEMA ?? 'public';
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    if (schemaName !== 'public') {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}"`);
    }

    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);

    const lastResult = await client.query(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );
    const lastApplied = lastResult.rows[0];

    const migrationsFolder = resolveMigrationsFolder();
    const journalPath = resolve(migrationsFolder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

    await client.query('BEGIN');
    await client.query(`SET search_path TO "${schemaName}"`);
    const sp = await client.query("SELECT current_setting('search_path') AS search_path");
    // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
    console.log('search_path=' + sp.rows[0].search_path);
    try {
      for (const entry of journal.entries) {
        if (lastApplied && Number(lastApplied.created_at) >= entry.when) {
          continue;
        }

        const sqlPath = resolve(migrationsFolder, `${entry.tag}.sql`);
        const sqlContent = readFileSync(sqlPath, 'utf8');
        const statements = sqlContent.split('--> statement-breakpoint');

        for (const stmt of statements) {
          const trimmed = stmt.trim();
          if (!trimmed) continue;
          await client.query(trimmed);
        }

        const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
        await client.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [hash, entry.when],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
      console.log('migrations OK');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// N'exécuter la migration QUE si ce fichier est le point d'entrée.
const isEntrypoint =
  require.main === module ||
  process.argv[1]?.endsWith('migrate.ts') === true ||
  process.argv[1]?.endsWith('migrate.js') === true;

if (isEntrypoint) {
  main().catch((err) => {
    console.error('migration échouée', err);
    process.exit(1);
  });
}
