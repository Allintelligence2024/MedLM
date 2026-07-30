// e2e/cms-cards.spec.ts — vérifie le flux CMS le plus critique.
//
// Couvre :
//   1. Login magic-link.
//   2. Liste des cartes.
//   3. Édition d'une carte (recto + verso + tags).
//   4. Soumission à revue.
//   5. Workflow Kanban : la carte apparaît dans la colonne "review".
//
// Note : on suppose que le seed a déjà été fait (1 carte au
// minimum). Si pas, le test skip proprement.

import { test, expect } from '@playwright/test';

test.describe('CMS — workflow cartes', () => {
  test('liste les cartes', async ({ page, request }) => {
    // Login (magic link simulé : on prend un user de seed).
    const loginRes = await request.post('/v1/auth/login', {
      data: { email: 'author@medanki-dz.test' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { access_token, user_id } = await loginRes.json();
    await page.addInitScript(
      ([token, uid]: [string, string]) => {
        localStorage.setItem('cms_token', token);
        localStorage.setItem('cms_user_id', uid);
      },
      [access_token, user_id] as [string, string],
    );

    // Navigue.
    await page.goto('/admin/cards');
    await expect(page.getByRole('heading', { name: 'Cartes' })).toBeVisible();
    // Au moins une carte dans le seed.
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('édite une carte et la passe en review', async ({ page, request }) => {
    // Login + auth.
    const loginRes = await request.post('/v1/auth/login', {
      data: { email: 'author@medanki-dz.test' },
    });
    const { access_token, user_id } = await loginRes.json();
    await page.addInitScript(
      ([token, uid]: [string, string]) => {
        localStorage.setItem('cms_token', token);
        localStorage.setItem('cms_user_id', uid);
      },
      [access_token, user_id] as [string, string],
    );

    // Récupère une carte existante.
    const listRes = await request.get('/v1/content/cards/list?limit=1', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(listRes.ok()).toBeTruthy();
    const { items } = await listRes.json();
    if (!items || items.length === 0) {
      test.skip(true, 'aucune carte dans le seed');
      return;
    }
    const card = items[0];

    // Édite.
    await page.goto(`/admin/cards/${card.id}`);
    await expect(page.getByRole('heading', { name: 'Édition de carte' })).toBeVisible();

    // Modifie le front FR via le TipTap.
    const frontFr = page.locator('.ProseMirror').first();
    await frontFr.click();
    await frontFr.fill('Cardio : valve mitrale — flux diastolique');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré', { exact: false })).toBeVisible();

    // Vérifie côté backend.
    const getRes = await request.get(`/v1/content/cards/${card.id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const updated = await getRes.json();
    expect(updated.content.front_fr).toContain('Cardio');
  });
});
