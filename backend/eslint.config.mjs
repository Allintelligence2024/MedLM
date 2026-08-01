// ESLint flat config (v9) — MedAnki DZ backend.
//
// Avant : `npm run lint` échouait systématiquement — ESLint 9 exige
// une config flat et le repo n'en avait aucune. Cette config couvre
// src/ + test/ en TS, avec les règles réellement utiles au projet :
//   * no-console en error : un log ne passe que via la sentinelle
//     `// eslint-disable-next-line no-console` (security_audit.py
//     honore exactement le même mécanisme — les deux gardes se
//     renforcent au lieu de se contredire) ;
//   * no-unused-vars TS avec tolérance `_` (cohérent avec tsconfig
//     noUnusedLocals qui accepte le préfixe underscore pour les params).
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.js', '*.mjs'],
  },
  js.configs.recommended,
  {
    // Scripts utilitaires Node (génération de clés, etc.) : ce sont
    // des CLI — console est leur interface, d'où l'absence de la
    // règle no-console, mais les globals Node doivent être déclarés
    // pour que no-undef (js.configs.recommended) ne hurle pas.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-console': 'error',
      // Couverts par tsc (noUnusedLocals, types stricts) — les versions
      // JS de base ne comprennent ni les types globaux (RequestInit,
      // NodeJS) ni le pattern DTO « type + const du même nom » (Zod).
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];
