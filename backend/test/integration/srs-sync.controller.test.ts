/// Test d'intégration HTTP du contrôleur SrsSync.
///
/// Stratégie : on monte un module NestJS **réel** mais on substitue le
/// `DRIZZLE` provider par un fake. Cela permet de tester la pile
/// validation → contrôleur → service → réponse, sans dépendre d'un
/// PostgreSQL.
///
/// En CI, on garde aussi un test d'intégration « end-to-end » contre
/// Neon (cf. `backend-ci.yml` workflow), qui lui crée vraiment les
/// enregistrements.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/database.module';
import { FsrsModule } from '../../src/common/fsrs/fsrs.module';
import { SrsSyncModule } from '../../src/srs-sync/srs-sync.module';
import { AuthModule } from '../../src/auth/auth.module';
import { ContentModule } from '../../src/content/content.module';

class FakeDb {
  events: any[] = [];
  existing = new Set<string>();
  states: any[] = [];

  async transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> {
    return fn(this);
  }
  select(): any {
    const self = this;
    return {
      from() {
        return {
          where() {
            return {
              orderBy() {
                return {
                  limit(n: number) {
                    return Promise.resolve(self.events.slice(0, n));
                  },
                };
              },
            };
          },
        };
      },
    };
  }
  insert(): any {
    const self = this;
    return {
      values(v: any) {
        return {
          async onConflictDoUpdate() {
            if (v.id) {
              if (!self.existing.has(v.id)) {
                self.existing.add(v.id);
                self.events.push(v);
              }
            }
            return Promise.resolve();
          },
          async returning() {
            return [{ id: v.id ?? 'x' }];
          },
        };
      },
    };
  }
}

describe('SRS Sync — HTTP end-to-end (fake DB)', () => {
  let app: INestApplication;
  const fake = new FakeDb();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/srs-sync/push accepte un événement', async () => {
    const event = {
      id: '00000000-0000-7000-8000-000000000001',
      card_id: '00000000-0000-4000-8000-000000000002',
      user_id: '00000000-0000-4000-8000-000000000003',
      device_id: 'd1',
      rating: 3,
      duration_ms: 100,
      card_type: 'basic',
      reviewed_at: 1_700_000_000_000,
      exam_mode: false,
    };
    const res = await request(app.getHttpServer())
      .post('/v1/srs-sync/push')
      .set('X-User-Id', '00000000-0000-4000-8000-000000000003')
      .set('X-Device-Id', 'd1')
      .send({ events: [event] })
      .expect(200);
    expect(res.body.accepted).toContain(event.id);
  });

  it('POST /v1/srs-sync/push refuse un batch > 100', async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({
      id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
      card_id: '00000000-0000-4000-8000-000000000002',
      user_id: '00000000-0000-4000-8000-000000000003',
      device_id: 'd1',
      rating: 3,
      duration_ms: 0,
      card_type: 'basic',
      reviewed_at: 1_700_000_000_000 + i,
      exam_mode: false,
    }));
    await request(app.getHttpServer())
      .post('/v1/srs-sync/push')
      .set('X-User-Id', '00000000-0000-4000-8000-000000000003')
      .set('X-Device-Id', 'd1')
      .send({ events })
      .expect(400);
  });

  it('GET /v1/srs-sync/pull retourne un next_cursor_ms', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/srs-sync/pull')
      .query({ since_ms: 0, limit: 10 })
      .set('X-User-Id', '00000000-0000-4000-8000-000000000003')
      .set('X-Device-Id', 'd1')
      .expect(200);
    expect(res.body).toHaveProperty('next_cursor_ms');
    expect(res.body).toHaveProperty('events');
  });

  it('GET /v1/health répond 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200);
    expect(res.body.status).toMatch(/ok|degraded/);
  });
});
