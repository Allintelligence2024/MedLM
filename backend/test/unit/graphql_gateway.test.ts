// Tests Phase 20.2 — gateway GraphQL (opérations persistées, budget,
// délégation REST avec backend simulé).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeOperationText,
  matchPersistedOperation,
  budgetUsed,
  budgetRemaining,
  restQueryFor,
  GATEWAY_COST_BUDGET_PER_HOUR,
  PERSISTED_OPERATIONS,
  PERSISTED_NAMES,
} from '../../src/gateway/persisted-operations';
import { GatewayService } from '../../src/gateway/gateway.service';
import { InMemoryCostBudgetStore } from '../../src/gateway/cost-budget.store';
import type { RestBackend } from '../../src/gateway/rest-backend.port';

// ── Backend REST simulé ─────────────────────────────────────────────
class FakeRestBackend implements RestBackend {
  calls: Array<{ path: string; query: Record<string, string> }> = [];
  status = 200;
  body: unknown = {};

  async get(path: string, args: { jwt: string; query: Record<string, string> }) {
    this.calls.push({ path, query: args.query });
    return { status: this.status, body: this.body };
  }
}

const NOW = 1_800_000_000_000;

function find(name: string) {
  const op = PERSISTED_OPERATIONS.find((o) => o.name === name);
  if (!op) throw new Error(`op manquante: ${name}`);
  return op;
}

describe('normalizeOperationText', () => {
  it('commentaires et espaces ignorés → même empreinte', () => {
    const a = 'query ViewerStats($period: StatsPeriod) { viewerStats(period: $period) { period } }';
    const b = '  query ViewerStats($period: StatsPeriod) { # commentaire\n    viewerStats(period: $period) {  period } }  ';
    expect(normalizeOperationText(a)).toBe(normalizeOperationText(b));
  });
});

describe('matchPersistedOperation', () => {
  it('retrouve chaque opération par son texte exact (normalisé)', () => {
    for (const op of PERSISTED_OPERATIONS) {
      const found = matchPersistedOperation(op.sdl);
      expect(found?.name).toBe(op.name);
    }
  });

  it('variante de mise en page acceptée', () => {
    const op = find('DeckCatalog');
    const pretty = op.sdl.replaceAll(' { ', '{\n  ');
    expect(matchPersistedOperation(pretty)?.name).toBe('DeckCatalog');
  });

  it('TOUTE requête arbitraire est rejetée (injection GraphQL)', () => {
    expect(matchPersistedOperation('query { __schema { types { name } } }')).toBeNull();
    expect(matchPersistedOperation('mutation { deleteAll }')).toBeNull();
    expect(matchPersistedOperation('query ViewerStats { viewerStats { period xyzSecret } }')).toBeNull();
  });
});

describe('budget de coût', () => {
  it('fenêtre glissante : les coûts anciens expirent', () => {
    const entries = [
      { at: NOW - 3_700_000, cost: 400 }, // > 1h : expiré
      { at: NOW - 1000, cost: 30 },
    ];
    expect(budgetUsed(entries, NOW)).toBe(30);
    expect(budgetRemaining(entries, NOW)).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR - 30,
    );
  });
});

describe('restQueryFor', () => {
  it('allow-list des clés + mapping snake_case', () => {
    const op = find('MockExamTemplates');
    const q = restQueryFor(op, { faculty: 'Alger', studyYear: 2, evil: 'x' });
    expect(q).toEqual({ faculty: 'Alger', study_year: '2' });
  });

  it('les variables absentes ne produisent pas de clé vide', () => {
    const op = find('LeaderboardTop');
    expect(restQueryFor(op, { limit: 10 })).toEqual({ limit: '10' });
  });
});

describe('GatewayService.execute', () => {
  let backend: FakeRestBackend;
  let service: GatewayService;

  beforeEach(() => {
    backend = new FakeRestBackend();
    // Store mémoire = comportement historique mono-instance
    // (audit P2-2 : en production Redis prend le relais).
    service = new GatewayService(backend, new InMemoryCostBudgetStore());
  });

  it('rejette une opération non persistée (400)', async () => {
    const res = await service.execute({
      userId: 'u1',
      jwt: 'tok',
      queryText: 'query { secretStuff }',
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(400);
      expect(res.errors[0]!.code).toBe('OPERATION_NOT_PERSISTED');
    }
  });

  it('valide les variables par Zod strict', async () => {
    const res = await service.execute({
      userId: 'u1',
      jwt: 'tok',
      queryText: find('ViewerStats').sdl,
      variables: { period: 'year', extra: 1 },
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.code).toBe('BAD_VARIABLES');
  });

  it('délègue au REST interne et shape la réponse', async () => {
    backend.body = {
      period: 'all',
      cards_reviewed: 123,
      accuracy: 0.87,
      current_streak: 9,
      xp_total: 4200,
      level: 'gold',
      leech_count: 2,
    };
    const res = await service.execute({
      userId: 'u1',
      jwt: 'tok',
      queryText: find('ViewerStats').sdl,
      variables: { period: 'all' },
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        viewerStats: {
          period: 'all',
          cardsReviewed: 123,
          accuracy: 0.87,
          currentStreak: 9,
          xpTotal: 4200,
          level: 'gold',
          leechCount: 2,
        },
      });
    }
    expect(backend.calls[0]!.path).toBe('/stats/me');
    expect(backend.calls[0]!.query).toEqual({ period: 'all' });
  });

  it('budget épuisé → 429', async () => {
    const op = find('ViewerStats'); // coût 10
    const calls = Math.ceil(GATEWAY_COST_BUDGET_PER_HOUR / op.cost);
    for (let i = 0; i < calls; i++) {
      await service.execute({
        userId: 'u1',
        jwt: 'tok',
        queryText: op.sdl,
        now: NOW + i,
      });
    }
    const res = await service.execute({
      userId: 'u1',
      jwt: 'tok',
      queryText: op.sdl,
      now: NOW + calls,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(429);
      expect(res.errors[0]!.code).toBe('COST_BUDGET_EXCEEDED');
    }
  });

  it('budget indépendant par utilisateur', async () => {
    const op = find('DeckCatalog');
    backend.body = { items: [] };
    await service.execute({ userId: 'uA', jwt: 'a', queryText: op.sdl, now: NOW });
    const res = await service.execute({
      userId: 'uB',
      jwt: 'b',
      queryText: op.sdl,
      now: NOW,
    });
    expect(res.ok).toBe(true);
  });

  it('REST en échec → erreur contrôlée', async () => {
    backend.status = 500;
    const res = await service.execute({
      userId: 'u1',
      jwt: 'tok',
      queryText: find('DeckCatalog').sdl,
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.code).toBe('UPSTREAM_ERROR');
  });
});

describe('contrat v1', () => {
  it('toutes les opérations sont nommées et à coût > 0', () => {
    expect(PERSISTED_NAMES.length).toBeGreaterThanOrEqual(5);
    for (const op of PERSISTED_OPERATIONS) {
      expect(op.cost).toBeGreaterThan(0);
      expect(op.sdl.startsWith(`query ${op.name} `) || op.sdl.startsWith(`query ${op.name}(`)).toBe(true);
    }
  });

  it('aucune mutation en v1', () => {
    for (const op of PERSISTED_OPERATIONS) {
      expect(op.sdl.includes('mutation')).toBe(false);
      expect(op.rest.method).toBe('GET');
    }
  });
});
