// Vitest config — tests d'INTÉGRATION (vraie PostgreSQL).
//
// Séparée de vitest.config.ts car la config principale épingle
// `include: ['test/unit/**']` : `--dir test/integration` seul ne
// trouvait aucun fichier (les patterns sont relatifs à ce dir).
// Ici on inverse : on inclut test/integration/** et on exclut l'unitaire.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    include: ['test/integration/**/*.test.ts'],
    exclude: ['test/unit/**', 'node_modules/**', 'dist/**'],
    reporters: ['default'],
  },
});
