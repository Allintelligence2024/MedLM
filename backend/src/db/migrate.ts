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
/// Important : les triggers SQL (notamment `review_logs_no_update` et
/// `review_logs_no_delete`) sont dans une migration séparée
/// (`0002_append_only_triggers.sql`) parce que drizzle-kit ne sait pas
/// les générer nativement.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/// Localise le dossier de migrations selon le contexte d'exécution.
///
/// Le chemin était écrit en dur (`./src/db/migrations`) : correct en
/// développement (`tsx src/db/migrate.ts` depuis `backend/`), FAUX dans
/// l'image Docker, où le Dockerfile copie les `.sql` vers
/// `dist/db/migrations` et où `src/` n'existe pas. Toute tentative de
/// migration depuis le conteneur aurait échoué sur un dossier absent.
///
/// On sonde donc les emplacements connus, dans l'ordre de spécificité,
/// et on échoue explicitement si aucun ne convient — plutôt que de
/// laisser drizzle jeter un « Can't find meta/_journal.json » qui
/// enverrait chercher au mauvais endroit.
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

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  // Script CLI : sa sortie standard EST son interface utilisateur
  // (justifié — sentinelles explicites reconnues par security_audit.py).
  // eslint-disable-next-line no-console
  console.log('migrations en cours…');
  const migrationsFolder = resolveMigrationsFolder();
  // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
  console.log(`dossier : ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console -- CLI : stdout est le canal prévu
  console.log('migrations OK');

  await pool.end();
}

// N'exécuter la migration QUE si ce fichier est le point d'entrée.
//
// Sans cette garde, un simple `import` du module (pour réutiliser
// `resolveMigrationsFolder` dans un test, par exemple) déclenchait une
// connexion PostgreSQL puis un `process.exit(1)` — ce qui tuait le
// processus appelant. Même piège que `main.ts`, qui le documente déjà.
const isEntrypoint =
  require.main === module ||
  process.argv[1]?.endsWith('migrate.ts') === true ||
  process.argv[1]?.endsWith('migrate.js') === true;

if (isEntrypoint) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- CLI : stderr est le canal prévu
    console.error('migration échouée', err);
    process.exit(1);
  });
}
