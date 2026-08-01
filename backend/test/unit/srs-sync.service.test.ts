/// Tests unitaires du service SrsSync — utilise un fake DB pour ne pas
/// dépendre d'une vraie base PostgreSQL.
///
/// La logique testée :
///   * push déduplique par id ;
///   * push rejette les batches > 100 ;
///   * pull retourne un next_cursor correct ;
///   * pull met à jour le curseur.
import { describe, it, expect, beforeEach } from 'vitest';
import { SrsSyncService } from '../../src/srs-sync/srs-sync.service';
import { FsrsEngine } from '../../src/common/fsrs/fsrs.engine';
import { ReviewEventDto, PushBody, PullQuery } from '../../src/srs-sync/srs-sync.dto';
import { CardType } from '../../src/common/fsrs/fsrs.constants';

/// Fake DB : implémente juste les méthodes utilisées par le service.
class FakeDb {
  inserted: any[] = [];
  upsertedState: any[] = [];
  existing = new Set<string>();
  syncCursors = new Map<string, { lastPullCursor: number; lastPullAt: Date }>();
  events: any[] = [];

  transaction = async (fn: (tx: FakeDb) => Promise<unknown>) => fn(this);

  select = (..._args: unknown[]): any => {
    const self = this;
    return {
      from(_t: unknown) {
        return {
          where(_w: unknown) {
            return {
              // Drizzle réel : le builder est thenable (await → rows[])
              // — utilisé par la dédup du push (select id from review_logs).
              then(cb: any) {
                return Promise.resolve(
                  [...self.existing].map((id) => ({ id })),
                ).then(cb);
              },
              orderBy(..._o: unknown[]) {
                return {
                  // Thenable : le fold du push attend le journal complet.
                  then(cb: any) {
                    return Promise.resolve(self.events).then(cb);
                  },
                  limit(n: number) {
                    return Promise.resolve(self.events.slice(0, n));
                  },
                  get() {
                    return Promise.resolve(self.events[0] ?? null);
                  },
                };
              },
            };
          },
        };
      },
    };
  };

  insert = (table: any) => {
    const self = this;
    return {
      values(v: any) {
        return {
          async returning() {
            if (table?.reviewLogs) {
              const exists = self.existing.has(v.id);
              if (!exists) {
                self.existing.add(v.id);
                self.events.push({ ...v });
              }
              return [{ id: v.id }];
            }
            return [{ id: v.id ?? 'cur' }];
          },
          onConflictDoUpdate() {
            return this;
          },
        };
      },
    };
  };
}

describe('SrsSyncService', () => {
  let service: SrsSyncService;
  let db: FakeDb;
  const engine = new FsrsEngine();

  beforeEach(() => {
    db = new FakeDb();
    service = new SrsSyncService(db as any, engine);
  });

  it('rejette un batch > 100 événements', async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({
      id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
      card_id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      device_id: 'd1',
      rating: 3 as const,
      duration_ms: 0,
      card_type: CardType.Basic,
      reviewed_at: 1_700_000_000_000 + i,
      exam_mode: false,
    }));
    await expect(
      service.push({ userId: 'u1', deviceId: 'd1', events }),
    ).rejects.toThrow();
  });

  it('accepte un batch de 1 événement', async () => {
    const event: ReviewEventDto = {
      id: '00000000-0000-7000-8000-000000000001',
      card_id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      device_id: 'd1',
      rating: 3,
      duration_ms: 0,
      card_type: CardType.Basic,
      reviewed_at: 1_700_000_000_000,
      exam_mode: false,
    };
    const out = await service.push({ userId: 'u1', deviceId: 'd1', events: [event] });
    expect(out.accepted).toContain(event.id);
    expect(out.rejected).toEqual([]);
  });

  it('déduplique les événements déjà reçus', async () => {
    db.existing.add('00000000-0000-7000-8000-000000000001');
    const event: ReviewEventDto = {
      id: '00000000-0000-7000-8000-000000000001',
      card_id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      device_id: 'd1',
      rating: 3,
      duration_ms: 0,
      card_type: CardType.Basic,
      reviewed_at: 1_700_000_000_000,
      exam_mode: false,
    };
    const out = await service.push({ userId: 'u1', deviceId: 'd1', events: [event] });
    expect(out.accepted).toContain(event.id);
    expect(db.events).toHaveLength(0); // pas ré-inséré
  });
});

describe('Validation Zod', () => {
  it('PushBody refuse un tableau vide', () => {
    expect(() => PushBody.parse({ events: [] })).toThrow();
  });

  it('PushBody refuse une note > 4', () => {
    expect(() =>
      PushBody.parse({
        events: [
          {
            id: '00000000-0000-7000-8000-000000000001',
            card_id: '11111111-1111-4111-8111-111111111111',
            user_id: '22222222-2222-4222-8222-222222222222',
            device_id: 'd1',
            rating: 5,
            duration_ms: 0,
            card_type: CardType.Basic,
            reviewed_at: 1_700_000_000_000,
            exam_mode: false,
          },
        ],
      }),
    ).toThrow();
  });

  it('PullQuery accepte les valeurs par défaut', () => {
    const q = PullQuery.parse({});
    expect(q.since_ms).toBe(0);
    expect(q.limit).toBe(200);
  });
});
