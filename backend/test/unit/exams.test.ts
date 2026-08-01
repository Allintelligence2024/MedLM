// Tests Phase 10 — ExamsService.
//
// On vérifie :
//   * start pose le timer côté serveur (now())
//   * submit rejette après expiration
//   * scoring = correct / total
//   * questions ratées injectent un ReviewEvent dans le journal
import { describe, it, expect, beforeEach } from 'vitest';
import { ExamsService } from '../../src/exams/exams.service';
import {
  examAttempts,
  examQuestions,
  examTemplates,
  reviewLogs,
  studySessions,
  srsCardState,
  cards,
} from '../../src/db/schema';

class FakeDb {
  attempts: any[] = [];
  questions: any[] = [];
  reviewLogs: any[] = [];
  sessions: any[] = [];
  srsState: any[] = [];

  // Le sujet tel que stocké dans exam_templates (durée en minutes).
  templateMeta: any = { id: 't1', durationMinutes: 30, passThreshold: '0.5' };

  private _rows(table: any): any[] {
    if (table === examAttempts) return this.attempts;
    if (table === examQuestions) return this.questions;
    if (table === examTemplates) return [this.templateMeta];
    if (table === reviewLogs) return this.reviewLogs;
    if (table === studySessions) return this.sessions;
    if (table === srsCardState) return this.srsState;
    if (table === cards) return [{ id: 'c-card', deckId: 'd1' }];
    return [];
  }

  // Drizzle réel : le builder est THENABLE (await → rows[]).
  select(): any {
    return {
      from: (table: any) => ({
        where: () => {
          const p = Promise.resolve(this._rows(table));
          return { then: (cb: any) => p.then(cb) };
        },
      }),
    };
  }

  insert(table: any): any {
    return {
      values: (v: any) => {
        const rows = this._rows(table);
        const done = Promise.resolve().then(() => { rows.push(v); });
        return {
          then: (cb: any) => done.then(cb),
          onConflictDoUpdate: async () => { rows.push(v); },
          returning: async () => [v],
        };
      },
    };
  }

  update(table: any): any {
    return {
      set: (v: any) => ({
        where: () => {
          const rows = this._rows(table);
          const done = Promise.resolve().then(() => {
            for (const r of rows) Object.assign(r, v);
          });
          return { then: (cb: any) => done.then(cb) };
        },
      }),
    };
  }

  transaction = async (fn: (tx: FakeDb) => Promise<unknown>) => fn(this);
}

describe('ExamsService', () => {
  let db: FakeDb;
  let service: ExamsService;

  beforeEach(() => {
    db = new FakeDb();
    service = new ExamsService(db as any);
  });

  it('start pose expiresAt = now + duration', async () => {
    const t0 = Date.now();
    const attempt = await service.start({ userId: 'u1', templateId: 't1' });
    expect(attempt.expires_at - attempt.started_at).toBe(30 * 60_000);
    expect(attempt.started_at).toBeGreaterThanOrEqual(t0);
  });

  it('questions renvoyées au client SANS les bonnes réponses', async () => {
    db.questions = [
      { id: 'q1', templateId: 't1', position: 1, options: [
        { id: 'A', fr: 'opt1', is_correct: true },
        { id: 'B', fr: 'opt2', is_correct: false },
      ], isMultiple: false, cardId: 'c1', deckId: 'd1' },
    ];
    const attempt = await service.start({ userId: 'u1', templateId: 't1' });
    expect(attempt.questions[0]!.correctOptionIds).toEqual([]);
  });

  it('submit rejette après expiration (tolérance 5s)', async () => {
    db.attempts.push({
      id: 'a1',
      userId: 'u1',
      templateId: 't1',
      startedAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() - 60_000), // expiré depuis 60s
      status: 'in_progress',
    });
    db.questions = [
      { id: 'q1', templateId: 't1', position: 1, isMultiple: false, options: [
        { id: 'A', fr: 'o1', is_correct: true },
        { id: 'B', fr: 'o2', is_correct: false },
      ] },
    ];

    await expect(
      service.submit({ userId: 'u1', attemptId: 'a1', body: { answers: [{ question_id: 'q1', selected: ['A'], duration_ms: 0 }] } }),
    ).rejects.toThrow(/temps écoulé/);
  });

  it('scoring = correct / total', async () => {
    db.attempts.push({
      id: 'a1',
      userId: 'u1',
      templateId: 't1',
      startedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      status: 'in_progress',
    });
    db.questions = [
      { id: 'q1', templateId: 't1', position: 1, isMultiple: false, cardId: 'c1', options: [
        { id: 'A', fr: 'o1', is_correct: true },
        { id: 'B', fr: 'o2', is_correct: false },
      ] },
      { id: 'q2', templateId: 't1', position: 2, isMultiple: false, cardId: 'c2', options: [
        { id: 'X', fr: 'o1', is_correct: false },
        { id: 'B', fr: 'o2', is_correct: true },
      ] },
      { id: 'q3', templateId: 't1', position: 3, isMultiple: false, cardId: 'c3', options: [
        { id: 'C', fr: 'o1', is_correct: true },
        { id: 'D', fr: 'o2', is_correct: false },
      ] },
    ];

    const out = await service.submit({
      userId: 'u1',
      attemptId: 'a1',
      body: {
        answers: [
          { question_id: 'q1', selected: ['A'], duration_ms: 100 }, // correct
          { question_id: 'q2', selected: ['X'], duration_ms: 100 }, // incorrect
          { question_id: 'q3', selected: [], duration_ms: 0 }, // unanswered
        ],
      },
    });
    expect(out.scoring.correct).toBe(1);
    expect(out.scoring.incorrect).toBe(1);
    expect(out.scoring.unanswered).toBe(1);
    expect(out.scoring.score).toBeCloseTo(1 / 3, 5);
    expect(out.scoring.pass).toBe(false);
    expect(out.missed).toEqual(['q2', 'q3']);
    expect(out.injected).toBe(2); // q2 et q3 ont des cards
  });
});
