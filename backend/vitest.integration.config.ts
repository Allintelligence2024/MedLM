// Vitest config — tests d'INTÉGRATION (vraie PostgreSQL / app NestJS
// bootée).
//
// Séparée de vitest.config.ts car la config principale épingle
// `include: ['test/unit/**']`. Ici on inverse : on inclut
// test/integration/** et on exclut l'unitaire.
//
// POINT CRITIQUE (audit 2026-08-01) : esbuild (transform vitest par
// défaut) N'ÉMET PAS les métadonnées `design:paramtypes` dont l'IoC de
// NestJS a besoin pour injecter (ConfigService, JwtService…). Un boot
// AppModule sous esbuild se termine par des dépendances injectées à
// `undefined` — crash. On passe donc par SWC avec
// `decoratorMetadata: true` — inutile pour les tests unitaires
// (instanciation directe) mais indispensable ici.
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
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
