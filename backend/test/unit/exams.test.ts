// Tests Phase 10 — ExamsService.
//
// On vérifie :
//   * start pose le timer côté serveur (now())
//   * submit rejette après expiration
//   * scoring = correct / total
//   * questions ratées injectent un ReviewEvent dans le journal
import { describe, it, expect, beforeEach } from 'vitest';
import { ExamsService } from '../../src/exams/exams.service';

class FakeDb {
  attempts: any[] = [];
  questions: any[] = [];
  reviewLogs: any[] = [];
  sessions: any[] = [];
  srsState: any[] = [];
  templateMeta: any = { durationMinutes: 30, deckId: 'd1' };

  // Stubs minimaux : on ne couvre que les chemins de l'ExamsService.
  select(): any {
    const self = this;
    return {
      from() {
        return {
          where() {
            return {
              get() {
                return Promise.resolve(self.templateMeta);
              },
            };
          },
        };
      },
    };
  }
  insert(table: any): any {
    const self = this;
    return {
      values(v: any) {
        return {
          async returning() {
            if (table?.reviewLogs) self.reviewLogs.push(v);
            else if (table?.studySessions) self.sessions.push(v);
            return [v];
          },
        };
      },
    };
  }
  update(): any {
    return { set() { return { where() { return this; } }; } };
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
      startedAt: Date.now() - 3600_000,
      expiresAt: Date.now() - 60_000, // expiré depuis 60s
      status: 'in_progress',
    });
    db.questions = [
      { id: 'q1', templateId: 't1', position: 1, options: [], isMultiple: false, correctOptionIds: ['A'] },
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
      startedAt: Date.now() - 60_000,
      expiresAt: Date.now() + 30 * 60_000,
      status: 'in_progress',
    });
    db.questions = [
      { id: 'q1', templateId: 't1', position: 1, options: [], isMultiple: false, correctOptionIds: ['A'], cardId: 'c1' },
      { id: 'q2', templateId: 't1', position: 2, options: [], isMultiple: false, correctOptionIds: ['B'], cardId: 'c2' },
      { id: 'q3', templateId: 't1', position: 3, options: [], isMultiple: false, correctOptionIds: ['C'], cardId: 'c3' },
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
