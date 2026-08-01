// Tests audit P2-2 — budget de coût partagé du gateway.
//
// Le bug : le budget vivait dans une Map d'instance. À N pods, le
// budget réel valait N × 500/h — un utilisateur consommait N fois la
// limite simplement parce que le load balancer répartissait ses
// requêtes. L'écart croît avec la charge : la limite lâchait
// exactement au moment où elle servait.
import { describe, it, expect, vi } from 'vitest';
import {
  BUCKET_COUNT,
  BUCKET_MS,
  InMemoryCostBudgetStore,
  RedisCostBudgetStore,
  bucketFor,
  bucketKeys,
  remainingFromBuckets,
  type RedisBudgetClient,
} from '../../src/gateway/cost-budget.store';
import {
  GATEWAY_COST_BUDGET_PER_HOUR,
  GATEWAY_WINDOW_MS,
} from '../../src/gateway/persisted-operations';

const NOW = 1_800_000_000_000;

/// Faux Redis : un Map, mais avec la sémantique atomique d'INCRBY.
class FakeRedis implements RedisBudgetClient {
  readonly store = new Map<string, number>();
  failNext = false;

  async mget(...keys: string[]): Promise<Array<string | null>> {
    if (this.failNext) throw new Error('redis down');
    return keys.map((k) => {
      const v = this.store.get(k);
      return v === undefined ? null : String(v);
    });
  }

  async incrby(key: string, value: number): Promise<number> {
    if (this.failNext) throw new Error('redis down');
    const next = (this.store.get(key) ?? 0) + value;
    this.store.set(key, next);
    return next;
  }

  async expire(): Promise<unknown> {
    return 1;
  }
}

describe('découpage en seaux', () => {
  it('couvre exactement la fenêtre d\'une heure', () => {
    expect(BUCKET_COUNT * BUCKET_MS).toBeGreaterThanOrEqual(GATEWAY_WINDOW_MS);
    expect(BUCKET_COUNT).toBe(60);
  });

  it('deux instants de la même minute partagent un seau', () => {
    expect(bucketFor(NOW)).toBe(bucketFor(NOW + 30_000));
  });

  it('deux minutes différentes ont des seaux différents', () => {
    expect(bucketFor(NOW)).not.toBe(bucketFor(NOW + BUCKET_MS));
  });

  it('les clés couvrent la fenêtre et sont propres à l\'utilisateur', () => {
    const keys = bucketKeys('u1', NOW);
    expect(keys).toHaveLength(BUCKET_COUNT);
    expect(new Set(keys).size).toBe(BUCKET_COUNT);
    expect(keys.every((k) => k.startsWith('gw:budget:u1:'))).toBe(true);
    expect(bucketKeys('u2', NOW)).not.toEqual(keys);
  });
});

describe('remainingFromBuckets', () => {
  it('budget plein quand tous les seaux sont vides', () => {
    expect(remainingFromBuckets([null, null, null])).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR,
    );
  });

  it('soustrait la somme des seaux', () => {
    expect(remainingFromBuckets([10, null, 20, 5])).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR - 35,
    );
  });

  it('ne descend jamais sous zéro', () => {
    expect(remainingFromBuckets([GATEWAY_COST_BUDGET_PER_HOUR + 100])).toBe(0);
  });
});

describe('InMemoryCostBudgetStore', () => {
  it('part d\'un budget plein', async () => {
    const store = new InMemoryCostBudgetStore();
    expect(await store.remaining('u1', NOW)).toBe(GATEWAY_COST_BUDGET_PER_HOUR);
  });

  it('décompte les consommations', async () => {
    const store = new InMemoryCostBudgetStore();
    await store.consume('u1', 30, NOW);
    await store.consume('u1', 20, NOW);
    expect(await store.remaining('u1', NOW)).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR - 50,
    );
  });

  it('isole les utilisateurs', async () => {
    const store = new InMemoryCostBudgetStore();
    await store.consume('u1', 100, NOW);
    expect(await store.remaining('u2', NOW)).toBe(GATEWAY_COST_BUDGET_PER_HOUR);
  });

  it('oublie ce qui sort de la fenêtre', async () => {
    const store = new InMemoryCostBudgetStore();
    await store.consume('u1', 100, NOW);
    const later = NOW + GATEWAY_WINDOW_MS + 1;
    expect(await store.remaining('u1', later)).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR,
    );
  });

  it('purge les entrées périmées (pas de fuite mémoire)', async () => {
    const store = new InMemoryCostBudgetStore();
    for (let i = 0; i < 200; i += 1) {
      await store.consume('u1', 1, NOW + i * BUCKET_MS);
    }
    // Après 200 minutes, seule la dernière heure compte.
    const last = NOW + 199 * BUCKET_MS;
    const used = GATEWAY_COST_BUDGET_PER_HOUR - (await store.remaining('u1', last));
    expect(used).toBeLessThanOrEqual(61);
  });
});

describe('RedisCostBudgetStore — le budget devient global', () => {
  it('deux « pods » partagent le même compteur', async () => {
    // C'EST le test du bug : avec l'implémentation mémoire, chaque
    // instance repartait de 500.
    const redis = new FakeRedis();
    const podA = new RedisCostBudgetStore(redis);
    const podB = new RedisCostBudgetStore(redis);

    await podA.consume('u1', 300, NOW);
    expect(await podB.remaining('u1', NOW)).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR - 300,
    );

    await podB.consume('u1', 150, NOW);
    expect(await podA.remaining('u1', NOW)).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR - 450,
    );
  });

  it('épuise le budget après la limite, tous pods confondus', async () => {
    const redis = new FakeRedis();
    const pods = [
      new RedisCostBudgetStore(redis),
      new RedisCostBudgetStore(redis),
      new RedisCostBudgetStore(redis),
    ];
    for (let i = 0; i < 50; i += 1) {
      await pods[i % 3]!.consume('u1', 10, NOW);
    }
    expect(await pods[0]!.remaining('u1', NOW)).toBe(0);
  });

  it('isole les utilisateurs', async () => {
    const redis = new FakeRedis();
    const store = new RedisCostBudgetStore(redis);
    await store.consume('u1', 400, NOW);
    expect(await store.remaining('u2', NOW)).toBe(GATEWAY_COST_BUDGET_PER_HOUR);
  });

  it('oublie ce qui sort de la fenêtre glissante', async () => {
    const redis = new FakeRedis();
    const store = new RedisCostBudgetStore(redis);
    await store.consume('u1', 500, NOW);
    expect(await store.remaining('u1', NOW)).toBe(0);
    // Une heure plus tard, les seaux consommés ne sont plus lus.
    expect(await store.remaining('u1', NOW + GATEWAY_WINDOW_MS + BUCKET_MS)).toBe(
      GATEWAY_COST_BUDGET_PER_HOUR,
    );
  });

  it('pose un TTL sur chaque seau (pas de purge à écrire)', async () => {
    const redis = new FakeRedis();
    const spy = vi.spyOn(redis, 'expire');
    await new RedisCostBudgetStore(redis).consume('u1', 10, NOW);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('Redis en panne → repli mémoire, jamais d\'exception', async () => {
    // Un gateway indisponible parce que Redis tousse serait pire que
    // le bug qu'on corrige.
    const redis = new FakeRedis();
    redis.failNext = true;
    const fallback = new InMemoryCostBudgetStore();
    const store = new RedisCostBudgetStore(redis, fallback);

    await expect(store.consume('u1', 100, NOW)).resolves.toBeUndefined();
    await expect(store.remaining('u1', NOW)).resolves.toBe(
      GATEWAY_COST_BUDGET_PER_HOUR - 100,
    );
  });
});
