// Tests — DRIZZLE_READ / PG_READ_POOL (Phase 17.2 finalisée).
//
// Verrous :
//   * resolveReadUrl : priorité DATABASE_READ_URL > première URL de
//     DATABASE_READ_REPLICA_URLS > null ;
//   * factories du module : pas de réplica → PG_READ_POOL null et
//     DRIZZLE_READ === DRIZZLE (retombe sur la primary, zéro drift) ;
//   * réplica configurée → pool distincte (max 25, moitié de 50).
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { Database } from '../../src/db/database.module';
import {
  DRIZZLE,
  DRIZZLE_READ,
  PG_POOL,
  PG_READ_POOL,
  resolveReadUrl,
} from '../../src/db/database.module';
import { DatabaseModule } from '../../src/db/database.module';

describe('resolveReadUrl', () => {
  it('absente → null (fallback primary)', () => {
    expect(resolveReadUrl({})).toBeNull();
    expect(
      resolveReadUrl({ DATABASE_READ_URL: '', DATABASE_READ_REPLICA_URLS: '' }),
    ).toBeNull();
  });

  it('DATABASE_READ_URL explicite gagne (trim appliqué)', () => {
    expect(
      resolveReadUrl({
        DATABASE_READ_URL: '  postgres://replica:5432/db  ',
        DATABASE_READ_REPLICA_URLS: 'postgres://other:5432/db',
      }),
    ).toBe('postgres://replica:5432/db');
  });

  it('DATABASE_READ_REPLICA_URLS : première URL de la liste', () => {
    expect(
      resolveReadUrl({
        DATABASE_READ_REPLICA_URLS:
          ' postgres://r1:5432/db , postgres://r2:5432/db ',
      }),
    ).toBe('postgres://r1:5432/db');
  });
});

describe('DatabaseModule — providers lecture', () => {
  // Accès aux factories sans démarrer Nest : les providers sont en
  // métadonnées @Module (reflect-metadata) — on les lit directement.
  const factoryOf = (provide: symbol) => {
    const moduleProviders = Reflect.getMetadata(
      'providers',
      DatabaseModule,
    ) as Array<{
      provide: unknown;
      useFactory: (...args: unknown[]) => unknown;
    }>;
    const found = moduleProviders.find((p) => p.provide === provide);
    if (!found) throw new Error(`provider ${String(provide)} introuvable`);
    return found.useFactory;
  };

  const config = (env: Record<string, string>) =>
    ({
      get: (key: string) => env[key],
    }) as unknown as ConfigService;

  it('PG_READ_POOL : pas de réplica → null', () => {
    expect(factoryOf(PG_READ_POOL)(config({}))).toBeNull();
  });

  it('PG_READ_POOL : réplica configurée → Pool (max 25, moitié primary)', () => {
    const pool = factoryOf(PG_READ_POOL)(
      config({ DATABASE_READ_URL: 'postgres://replica:5432/db' }),
    ) as Pool;
    expect(pool).toBeTruthy();
    expect((pool as any).options.max).toBe(25);
    return pool.end();
  });

  it('DRIZZLE_READ sans réplica === DRIZZLE primary (même instance)', () => {
    const primaryDrizzle = {} as Database;
    const readDrizzle = factoryOf(DRIZZLE_READ)(primaryDrizzle, null);
    expect(readDrizzle).toBe(primaryDrizzle);
  });

  it('DRIZZLE_READ avec réplica → instance drizzle distincte', () => {
    const primaryDrizzle = {} as Database;
    const readPool = factoryOf(PG_READ_POOL)(
      config({ DATABASE_READ_URL: 'postgres://replica:5432/db' }),
    ) as Pool;
    const readDrizzle = factoryOf(DRIZZLE_READ)(primaryDrizzle, readPool);
    expect(readDrizzle).not.toBe(primaryDrizzle);
    return readPool.end();
  });

  it('la pool primary reste dimensionnée à 50', () => {
    const pool = factoryOf(PG_POOL)(
      config({ DATABASE_URL: 'postgres://primary:5432/db' }),
    ) as Pool;
    expect((pool as any).options.max).toBe(50);
    return pool.end();
  });

  it('les deux symboles de lecture sont exportés du module', () => {
    expect(typeof DRIZZLE_READ).toBe('symbol');
    expect(typeof PG_READ_POOL).toBe('symbol');
    expect(String(DRIZZLE)).toContain('DRIZZLE');
  });
});
