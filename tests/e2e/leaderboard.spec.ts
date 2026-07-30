// e2e/leaderboard.spec.ts — vérifie le flow opt-in du leaderboard.

import { test, expect } from '@playwright/test';

test.describe('Leaderboard mobile (mock)', () => {
  test.skip(true, 'E2E mobile non couvert — voir tests/security et tests/unit pour le backend');

  // NOTE : on documente ici l'intention pour Phase 14. Pour
  // l'instant, le leaderboard est testé via les tests unitaires
  // (4 cas ISO week + service de tri) et le test d'intégration
  // manual via `flutter run`.
});
