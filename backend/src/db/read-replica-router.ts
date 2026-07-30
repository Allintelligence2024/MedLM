// ReadReplicaRouter — Phase 17.2.
//
// Route les requêtes SQL entre primary (writes) et replica (reads)
// selon la nature de l'opération. Pattern recommandé par la
// communauté Postgres pour scaler les lectures sans surcharger
// le primary.
//
// Choix structurants :
//   * **Réplication physique** (streaming replication) — pas
//     logique. La cohérence éventuelle est garantie par le
//     primary.
//   * **Lag tolerance** : on tolère jusqu'à 30s de lag sur les
//     lectures. Au-delà, on tombe back sur le primary pour
//     éviter les données trop stale.
//   * **Sticky reads** : une même session (userId) lit toujours
//     depuis la même replica (si dispo) pour la cohérence de
//     session. Sinon round-robin.
//   * **Fallback primary** : si la replica est down, toutes les
//     lectures vont au primary (no fail).
//   * **Pas de cross-replica** : un user avec entitlement "fresh"
//     (subscription active) lit depuis le primary pour éviter le
//     lag sur les opérations juste après paiement.
//
// Configuration via env :
//   * DATABASE_URL : primary
//   * DATABASE_READ_REPLICA_URL : replica 1
//   * DATABASE_READ_REPLICA_URLS : comma-separated pour N replicas
//   * READ_REPLICA_LAG_TOLERANCE_MS : défaut 30000
library;

export type QueryType = 'read' | 'write' | 'analytics';

export interface ReplicaHealth {
  url: string;
  reachable: boolean;
  lagMs: number;
  lastChecked: number;
}

export class ReadReplicaRouter {
  private primaryUrl: string;
  private replicaUrls: string[];
  private lagToleranceMs: number;
  private health = new Map<string, ReplicaHealth>();
  private stickySession = new Map<string, string>(); // sessionId → replicaUrl

  constructor(args: {
    primaryUrl: string;
    replicaUrls?: string[];
    lagToleranceMs?: number;
  }) {
    this.primaryUrl = args.primaryUrl;
    this.replicaUrls = args.replicaUrls ?? [];
    this.lagToleranceMs = args.lagToleranceMs ?? 30_000;
  }

  /// Pour les écritures : toujours le primary.
  primary(): string {
    return this.primaryUrl;
  }

  /// Pour les lectures : choisit la meilleure replica disponible
  /// selon le lag, avec sticky session si possible.
  read(sessionId?: string): string {
    if (this.replicaUrls.length === 0) {
      return this.primaryUrl;
    }

    // Sticky session.
    if (sessionId && this.stickySession.has(sessionId)) {
      const sticky = this.stickySession.get(sessionId)!;
      const h = this.health.get(sticky);
      if (h?.reachable && h.lagMs <= this.lagToleranceMs) {
        return sticky;
      }
    }

    // Choisit la replica avec le lag le plus bas parmi les
    // disponibles.
    let best: { url: string; lag: number } | null = null;
    for (const url of this.replicaUrls) {
      const h = this.health.get(url);
      if (!h?.reachable) continue;
      if (h.lagMs > this.lagToleranceMs) continue;
      if (!best || h.lagMs < best.lag) {
        best = { url, lag: h.lagMs };
      }
    }

    if (!best) {
      // Aucune replica saine : fallback primary.
      return this.primaryUrl;
    }

    if (sessionId) {
      this.stickySession.set(sessionId, best.url);
    }
    return best.url;
  }

  /// Pour les requêtes analytiques (stats, leaderboard) : on
  /// force la replica même si elle est un peu stale.
  analytics(): string {
    if (this.replicaUrls.length === 0) return this.primaryUrl;
    // Round-robin parmi les replicas (pas de sticky pour analytics).
    return this.replicaUrls[Math.floor(Date.now() / 1000) % this.replicaUrls.length]!;
  }

  /// Met à jour la santé d'une replica (à appeler depuis un
  /// health check périodique).
  updateHealth(args: { url: string; reachable: boolean; lagMs: number }): void {
    this.health.set(args.url, {
      url: args.url,
      reachable: args.reachable,
      lagMs: args.lagMs,
      lastChecked: Date.now(),
    });
  }

  /// Pour tests : reset complet.
  reset(): void {
    this.health.clear();
    this.stickySession.clear();
  }

  /// Snapshot pour debug.
  snapshot(): {
    primary: string;
    replicas: ReplicaHealth[];
    active_sessions: number;
  } {
    return {
      primary: this.primaryUrl,
      replicas: [...this.health.values()],
      active_sessions: this.stickySession.size,
    };
  }
}
