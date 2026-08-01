/// Script de migration — applique les migrations Drizzle au démarrage.
///
/// Utilisé :
///   * en CI, pour provisionner la base Neon avant les tests ;
///   * en production, comme point d'entrée du release ;
///   * en local, via `npm run db:migrate`.
///
/// Important : les triggers SQL (notamment `review_logs_no_update` et
/// `review_logs_no_delete`) sont dans une migration séparée
/// (`0002_append_only_triggers.sql`) parce que drizzle-kit ne sait pas
/// les générer nativement.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  // Script CLI : sa sortie standard EST son interface utilisateur
  // (justifié — sentinelles explicites reconnues par security_audit.py).
  // eslint-disable-next-line no-console
  console.log('migrations en cours…');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  // eslint-disable-next-line no-console
  console.log('migrations OK');

  await pool.end();
}

main().catch((err) => {
  console.error('migration échouée', err);
  process.exit(1);
});
