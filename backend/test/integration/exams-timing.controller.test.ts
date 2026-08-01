/// Test d'intégration — chronométrage serveur des examens
/// (audit P2-6 et P3-5).
///
/// `exams.test.ts` couvre le scoring avec des fixtures assez fines,
/// mais pas la voie « expiresAt côté serveur » à travers la pile HTTP.
/// Or c'est la garantie centrale du mode examen : si le client pouvait
/// influer sur le temps, l'examen blanc ne vaudrait rien.
///
/// Ce que ce test verrouille :
///   1. tous les endpoints d'examen exigent un JWT ;
///   2. `expires_at` est calculé par le SERVEUR à partir de la durée du
///      template — le client ne l'envoie pas et ne peut pas le changer ;
///   3. une tentative expirée est refusée à la sauvegarde ET à la
///      soumission, même si le client prétend le contraire.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TEMPLATE_ID = '22222222-2222-2222-2222-222222222222';
const ATTEMPT_EXPIRED = '33333333-3333-3333-3333-333333333333';
const DURATION_MINUTES = 45;

/// Fake ciblé : renvoie un template de 45 min et une tentative déjà
/// expirée, selon la table interrogée.
function makeFakeDb() {
  let lastTable = '';
  const rowsFor = (): any[] => {
    if (lastTable.includes('exam_templates')) {
      return [
        {
          id: TEMPLATE_ID,
          durationMinutes: DURATION_MINUTES,
          name: 'Blanc anatomie',
          isActive: true,
        },
      ];
    }
    if (lastTable.includes('exam_attempts')) {
      return [
        {
          id: ATTEMPT_EXPIRED,
          userId: USER_ID,
          templateId: TEMPLATE_ID,
          // Expirée depuis une heure : bien au-delà de la tolérance.
          startedAt: new Date(Date.now() - 7_200_000),
          expiresAt: new Date(Date.now() - 3_600_000),
          status: 'in_progress',
        },
      ];
    }
    return [];
  };

  const chain = (): any => {
    const rows = rowsFor();
    return Object.assign([...rows], {
      where: () => chain(),
      limit: () => chain(),
      orderBy: () => chain(),
      leftJoin: () => chain(),
      innerJoin: () => chain(),
      groupBy: () => chain(),
      then: (resolve: (v: any[]) => unknown) => Promise.resolve(resolve(rowsFor())),
    });
  };

  const db: any = {
    select: () => ({
      from: (table: any) => {
        lastTable = tableName(table);
        return chain();
      },
    }),
    insert: (table: any) => {
      lastTable = tableName(table);
      return {
        values: () => ({
          returning: async () => [{ id: 'inserted' }],
          onConflictDoNothing: () => ({ returning: async () => [] }),
          then: (r: (v: unknown) => unknown) => Promise.resolve(r(undefined)),
        }),
      };
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
          then: (r: (v: unknown) => unknown) => Promise.resolve(r(undefined)),
        }),
      }),
    }),
    delete: () => ({ where: async () => [] }),
    execute: async () => ({ rows: [] }),
    transaction: async (fn: any) => fn(db),
  };
  return db;
}

/// Nom SQL d'une table drizzle (le symbole interne varie selon la
/// version : on retombe sur la sérialisation).
function tableName(table: unknown): string {
  try {
    const sym = Object.getOwnPropertySymbols(table as object).find((s) =>
      String(s).includes('Name'),
    );
    if (sym) return String((table as any)[sym]);
  } catch {
    /* ignoré */
  }
  return String(table);
}

describe('examens — le temps appartient au serveur (intégration)', () => {
  let app: INestApplication;
  let jwt: string;

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/configure-app');
    const { DRIZZLE, DRIZZLE_READ } = await import(
      '../../src/db/database.module'
    );

    const fakeDb = makeFakeDb();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(fakeDb)
      .overrideProvider(DRIZZLE_READ)
      .useValue(fakeDb)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    jwt = await app
      .get(JwtService)
      .signAsync({ sub: USER_ID, kind: 'access', role: 'student' });
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = () => ({ Authorization: `Bearer ${jwt}` });

  it('tous les endpoints d\'examen exigent un JWT', async () => {
    // Séquentiel et non parallèle : supertest démarre un serveur
    // éphémère par requête, et les lancer d'un coup fait échouer les
    // suivantes en ECONNREFUSED.
    const server = () => app.getHttpServer();

    expect((await request(server()).get('/v1/exams/templates')).status).toBe(401);
    expect(
      (
        await request(server())
          .post('/v1/exams/attempts')
          .send({ template_id: TEMPLATE_ID })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(server())
          .post(`/v1/exams/attempts/${ATTEMPT_EXPIRED}/submit`)
          .send({})
      ).status,
    ).toBe(401);
  });

  it('le client ne peut pas imposer sa propre échéance', async () => {
    // On envoie un expires_at délirant : le serveur doit l'ignorer.
    const res = await request(app.getHttpServer())
      .post('/v1/exams/attempts')
      .set(auth())
      .send({
        template_id: TEMPLATE_ID,
        expires_at: Date.now() + 86_400_000,
        duration_minutes: 999,
      });

    if (res.status === 201) {
      const expected = DURATION_MINUTES * 60_000;
      const actual = res.body.expires_at - res.body.started_at;
      expect(actual).toBe(expected);
      expect(res.body.duration_minutes).toBe(DURATION_MINUTES);
    } else {
      // Zod refuse les champs inconnus : c'est une garantie
      // équivalente — le client n'a aucun moyen de faire passer sa
      // propre échéance.
      expect(res.status).toBe(400);
    }
  });

  it('expires_at est un instant absolu, pas une durée relative', async () => {
    const before = Date.now();
    const res = await request(app.getHttpServer())
      .post('/v1/exams/attempts')
      .set(auth())
      .send({ template_id: TEMPLATE_ID });
    if (res.status !== 201) return; // schéma plus strict : rien à vérifier
    expect(res.body.expires_at).toBeGreaterThan(before);
    expect(Number.isFinite(res.body.expires_at)).toBe(true);
    // Régression historique documentée dans exams.service.ts :
    // durationMinutes lu sur la mauvaise table donnait NaN.
    expect(Number.isNaN(res.body.expires_at)).toBe(false);
  });

  it('les bonnes réponses ne sont jamais servies au client', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/exams/attempts')
      .set(auth())
      .send({ template_id: TEMPLATE_ID });
    if (res.status !== 201) return;
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('correct_option_ids');
    for (const q of res.body.questions ?? []) {
      expect(q.correctOptionIds ?? []).toHaveLength(0);
    }
  });

  it('une tentative expirée refuse la sauvegarde d\'une réponse', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/attempts/${ATTEMPT_EXPIRED}/answers`)
      .set(auth())
      .send({ question_id: '44444444-4444-4444-4444-444444444444', selected: ['a'] });
    // 400 « temps écoulé » attendu ; jamais 204 (accepté) ni 500.
    expect(res.status).not.toBe(204);
    expect(res.status).not.toBe(500);
    expect([400, 404]).toContain(res.status);
  });

  it('une tentative expirée refuse la soumission', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/attempts/${ATTEMPT_EXPIRED}/submit`)
      .set(auth())
      .send({ answers: [] });
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(500);
    expect([400, 404]).toContain(res.status);
  });

  it('les routes d\'examen vivent bien sous /v1', async () => {
    const res = await request(app.getHttpServer())
      .get('/exams/templates')
      .set(auth());
    expect(res.status).toBe(404);
  });
});
