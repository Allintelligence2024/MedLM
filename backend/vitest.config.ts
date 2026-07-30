// Vitest config — MedAnki DZ backend.
//
// Pourquoi ce fichier :
//   * Sans config explicite, Vitest cherche `vite.config.*` ou
//     `vitest.config.*` à la racine. Sans lockfile (`package-lock.json`),
//     les versions installées peuvent diverger entre les runs CI et
//     locaux. Une config épinglée force le comportement.
//   * On définit explicitement le `pool: 'forks'` car certains de nos
//     services touchent des modules Node natifs (fs dans sentry.service
//     via ConfigService). 'forks' isole chaque test dans son propre
//     process.
//   * `globals: false` : on n'injecte pas describe/it globally, on
//     importe depuis 'vitest' partout. Plus explicite, plus simple
//     à grepper.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 10_000,
    include: ['test/unit/**/*.test.ts'],
    // On exclut explicitement les tests d'intégration du runner
    // `npm test` (qui sert uniquement aux tests unitaires). Les tests
    // d'intégration tournent via `npm run test:integration` contre
    // une vraie base PostgreSQL.
    exclude: ['test/integration/**', 'node_modules/**', 'dist/**'],
    reporters: ['default'],
  },
});
