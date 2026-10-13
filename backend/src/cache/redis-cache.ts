// RedisCache — Phase 17.3 + Phase 18 (intégration ioredis réelle).
//
// Wrapper sur `ioredis` avec :
//   * GET/SET/DEL/EXPIRE
//   * JSON encode/decode automatique
//   * TTL configurable
//   * Circuit breaker : si Redis tombe, on log + fallback no-op
//     (le service continue sans cache).
//   * Fail-soft : on n'échoue JAMAIS l'app à cause de Redis.
//
// Utilisé par :
//   * StatsService (Phase 15.2 — remplacer le cache mémoire par
//     Redis en prod).
//   * Sessions JWT (Phase 6 — rate limiting par user).
//   * Leaderboard (Phase 9 bis — cache hebdo).
//
// Si `REDIS_URL` n'est pas configuré, le cache est un no-op (mode
// dev). C'est important : on ne doit JAMAIS faire crasher l'app
// parce que Redis est down.

/// Type minimal pour ioredis (évite l'import direct pour ne pas
/// casser le dev sans Redis).
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<unknown>;
  /// Compteurs partagés — utilisés par le budget de coût du gateway
  /// (audit P2-2). Présents sur ioredis, déclarés ici pour rester
  /// indépendant de ses types.
  mget(...keys: string[]): Promise<Array<string | null>>;
  incrby(key: string, value: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface CacheOptions {
  /// TTL par défaut en secondes.
  defaultTtlSeconds?: number;
  /// Préfixe des clés (pour isoler les namespaces).
  keyPrefix?: string;
  /// Si vrai, force le mode no-op même si REDIS_URL est défini.
  forceNoop?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  errors: number;
}

export class RedisCache {
  private connected = false;
  private stats: CacheStats = { hits: 0, misses: 0, sets: 0, errors: 0 };
  private memoryStore = new Map<string, { value: string; expiresAt: number }>();
  private prefix: string;
  private redis: RedisLike | null = null;

  constructor(
    private readonly url: string | undefined,
    private readonly options: CacheOptions = {},
  ) {
    this.prefix = options.keyPrefix ?? 'medanki:';
  }

  /// Établit la connexion à Redis. Best-effort : si Redis est
  /// down, on log et on continue (mode dégradé). NE LANCE JAMAIS.
  async connect(): Promise<void> {
    if (!this.url || this.options.forceNoop) {
      this.connected = false;
      return;
    }
    try {
      const RedisModule = await import('ioredis');
      const RedisCtor = (RedisModule as { default?: unknown }).default ?? RedisModule;
      const client = new (RedisCtor as new (
        url: string,
        opts: Record<string, unknown>,
      ) => RedisLike)(this.url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        lazyConnect: true,
        connectTimeout: 1500,
        retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 200, 2000)),
      });
      // Le client est gardé même si le ping initial échoue : le budget
      // gateway peut alors choisir fail-open / fail-closed, au lieu de
      // rester coincé sur une Map d'instance.
      this.redis = client;
      try {
        const connectable = client as RedisLike & { connect?: () => Promise<void> };
        if (typeof connectable.connect === 'function') {
          await connectable.connect();
        }
        await client.get('__medanki_healthcheck__');
        this.connected = true;
      } catch {
        this.connected = false;
        this.stats.errors++;
      }
    } catch {
      this.connected = false;
      this.stats.errors++;
    }
  }

  /// Client ioredis si REDIS_URL a été fourni, même avant le premier ping.
  /// `null` uniquement en mode mémoire (pas d'URL / forceNoop).
  get client(): RedisLike | null {
    return this.redis;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;
    if (!this.connected || !this.redis) {
      return this._memoryGet<T>(fullKey);
    }
    try {
      const raw = await this.redis.get(fullKey);
      if (raw === null) {
        this.stats.misses++;
        return null;
      }
      this.stats.hits++;
      return JSON.parse(raw) as T;
    } catch {
      this.stats.errors++;
      return this._memoryGet<T>(fullKey);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.prefix + key;
    const ttl = ttlSeconds ?? this.options.defaultTtlSeconds ?? 60;
    const serialized = JSON.stringify(value);
    if (!this.connected || !this.redis) {
      this._memorySet(fullKey, serialized, ttl);
      return;
    }
    try {
      if (ttl > 0) {
        await this.redis.set(fullKey, serialized, 'EX', ttl);
      } else {
        await this.redis.set(fullKey, serialized);
      }
      this.stats.sets++;
    } catch {
      this.stats.errors++;
      this._memorySet(fullKey, serialized, ttl);
    }
  }

  async del(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    if (!this.connected || !this.redis) {
      this.memoryStore.delete(fullKey);
      return;
    }
    try {
      await this.redis.del(fullKey);
    } catch {
      this.stats.errors++;
    }
  }

  async flushPrefix(): Promise<void> {
    if (!this.connected || !this.redis) {
      for (const k of this.memoryStore.keys()) {
        if (k.startsWith(this.prefix)) this.memoryStore.delete(k);
      }
      return;
    }
    try {
      const keys = await this.redis.keys(this.prefix + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      this.stats.errors++;
    }
  }

  /// Ferme la connexion proprement. À appeler sur shutdown.
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // Ignorer.
      }
      this.redis = null;
      this.connected = false;
    }
  }

  getStats(): CacheStats & { connected: boolean; memory_size: number } {
    return { ...this.stats, connected: this.connected, memory_size: this.memoryStore.size };
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Helpers internes (mode no-op mémoire) ─────────────────

  private _memoryGet<T>(fullKey: string): T | null {
    const entry = this.memoryStore.get(fullKey);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.memoryStore.delete(fullKey);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  private _memorySet(fullKey: string, value: string, ttl: number): void {
    this.memoryStore.set(fullKey, {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : 0,
    });
    this.stats.sets++;
  }
}
