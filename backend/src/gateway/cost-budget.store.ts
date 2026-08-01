/// Budget de coût du gateway — stockage partagé (audit P2-2).
///
/// LE PROBLÈME : le budget vivait dans une `Map` d'instance. À N pods,
/// le budget réel devenait N × 500/h — un utilisateur pouvait consommer
/// N fois la limite simplement parce que le load balancer répartissait
/// ses requêtes. La documentation le reconnaissait comme « best
/// effort », mais l'écart croît linéairement avec la charge : c'est
/// exactement au moment où la limite sert qu'elle cesse de tenir.
///
/// LA CORRECTION : une interface, deux implémentations.
///   * `RedisCostBudgetStore` — compteur partagé entre tous les pods,
///     via une fenêtre glissante approximée par seaux d'une minute.
///     Redis est DÉJÀ dans la pile (redis-cache.ts), aucune dépendance
///     nouvelle.
///   * `InMemoryCostBudgetStore` — comportement historique, utilisé
///     quand `REDIS_URL` est absent (dev, test, mono-instance).
///
/// La sélection est automatique : présence de Redis = budget global.
/// Aucun changement de configuration à faire pour en bénéficier.
import { Logger } from '@nestjs/common';
import {
  GATEWAY_COST_BUDGET_PER_HOUR,
  GATEWAY_WINDOW_MS,
  budgetRemaining,
} from './persisted-operations';

export interface CostBudgetStore {
  /// Budget restant pour cet utilisateur, à l'instant `now`.
  remaining(userId: string, now: number): Promise<number>;

  /// Enregistre une consommation.
  consume(userId: string, cost: number, now: number): Promise<void>;
}

/// Découpage de la fenêtre en seaux d'une minute.
///
/// Une fenêtre glissante exacte imposerait de stocker chaque événement
/// (un sorted set par utilisateur, à purger). Soixante compteurs
/// entiers suffisent : l'erreur maximale est d'une minute sur une
/// fenêtre d'une heure, soit ~1,7 % — sans commune mesure avec le
/// facteur N du bug corrigé.
export const BUCKET_MS = 60_000;
export const BUCKET_COUNT = Math.ceil(GATEWAY_WINDOW_MS / BUCKET_MS);

export function bucketFor(now: number): number {
  return Math.floor(now / BUCKET_MS);
}

/// Clés des seaux couvrant la fenêtre qui se termine à `now`.
export function bucketKeys(userId: string, now: number): string[] {
  const current = bucketFor(now);
  const keys: string[] = [];
  for (let i = 0; i < BUCKET_COUNT; i += 1) {
    keys.push(`gw:budget:${userId}:${current - i}`);
  }
  return keys;
}

/// Budget restant à partir des valeurs de seaux lues.
export function remainingFromBuckets(values: Array<number | null>): number {
  const used = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return Math.max(0, GATEWAY_COST_BUDGET_PER_HOUR - used);
}

/// Implémentation mémoire — comportement historique (mono-instance).
export class InMemoryCostBudgetStore implements CostBudgetStore {
  private readonly usage = new Map<string, Array<{ at: number; cost: number }>>();

  async remaining(userId: string, now: number): Promise<number> {
    return budgetRemaining(this.usage.get(userId) ?? [], now);
  }

  async consume(userId: string, cost: number, now: number): Promise<void> {
    const entries = this.usage.get(userId) ?? [];
    entries.push({ at: now, cost });
    // Purge des entrées sorties de la fenêtre : sans elle, la Map
    // croîtrait indéfiniment pour un utilisateur actif.
    const since = now - GATEWAY_WINDOW_MS;
    this.usage.set(
      userId,
      entries.filter((e) => e.at >= since),
    );
  }
}

/// Sous-ensemble d'ioredis dont on a besoin. Défini localement pour ne
/// pas dépendre des types du paquet (chargé dynamiquement ailleurs).
export interface RedisBudgetClient {
  mget(...keys: string[]): Promise<Array<string | null>>;
  incrby(key: string, value: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/// Implémentation Redis — budget partagé entre tous les pods.
export class RedisCostBudgetStore implements CostBudgetStore {
  private readonly logger = new Logger(RedisCostBudgetStore.name);

  constructor(
    private readonly client: RedisBudgetClient,
    /// Repli utilisé si Redis répond une erreur : mieux vaut un budget
    /// par pod qu'un gateway indisponible.
    private readonly fallback: CostBudgetStore = new InMemoryCostBudgetStore(),
  ) {}

  async remaining(userId: string, now: number): Promise<number> {
    try {
      const raw = await this.client.mget(...bucketKeys(userId, now));
      return remainingFromBuckets(raw.map((v) => (v === null ? null : Number(v))));
    } catch (e) {
      this.logger.warn(
        `budget Redis illisible (${(e as Error).message}) — repli mémoire`,
      );
      return this.fallback.remaining(userId, now);
    }
  }

  async consume(userId: string, cost: number, now: number): Promise<void> {
    const key = `gw:budget:${userId}:${bucketFor(now)}`;
    try {
      await this.client.incrby(key, cost);
      // Le seau expire une fenêtre après sa fin : pas de purge à
      // écrire, Redis s'en charge.
      await this.client.expire(key, Math.ceil(GATEWAY_WINDOW_MS / 1000) + 60);
    } catch (e) {
      this.logger.warn(
        `budget Redis non incrémenté (${(e as Error).message}) — repli mémoire`,
      );
      await this.fallback.consume(userId, cost, now);
    }
  }
}
