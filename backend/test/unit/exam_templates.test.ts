// Tests ExamTemplatesService — Phase 10 bis.
import { describe, it, expect } from 'vitest';
import { ScoringService } from '../../src/exams/scoring.service';
import { examTemplates, examQuestions } from '../../src/db/schema';

/// DB fake minimale : table discriminée par identité (le schéma
/// Drizzle est chargé une fois pour toutes), builder THENABLE comme
/// le vrai (await → rows[]).
function fakeScoringDb(tplRows: any[], questionRows: any[]) {
  return {
    select: () => ({
      from: (t: any) => ({
        where: () => {
          const rows = t === examTemplates
            ? tplRows
            : t === examQuestions
              ? questionRows
              : [];
          return { then: (cb: any) => Promise.resolve(rows).then(cb) };
        },
      }),
    }),
  } as any;
}

describe('ScoringService — scoring pondéré', () => {
  it('retourne 0 si pas de questions', async () => {
    const svc = new ScoringService(
      fakeScoringDb([{ id: 't1', weights: {}, passThreshold: '0.5' }], []),
    );
    const res = await svc.computeForAttempt({
      attemptId: 'a1',
      templateId: 't1',
      correctIds: new Set(),
      incorrectIds: new Set(),
      unansweredIds: new Set(),
    });
    expect(res.totalQuestions).toBe(0);
    expect(res.weighted_score).toBe(0);
    expect(res.pct).toBe(0);
    expect(res.pass).toBe(false);
  });

  it('questions pondérées : weight=2 compte double', async () => {
    // 4 questions, weight de q2 = 2 (clé = question id).
    // Juste : q1, q2 — Faux : q3 — Sans réponse : q4.
    // Score = (1 + 2) / (1 + 2 + 1 + 1) = 3/5 = 0.6 → 60% → pass.
    const svc = new ScoringService(
      fakeScoringDb(
        [{ id: 't1', weights: { q2: 2 }, passThreshold: '0.5' }],
        [
          { id: 'q1', position: 1 },
          { id: 'q2', position: 2 },
          { id: 'q3', position: 3 },
          { id: 'q4', position: 4 },
        ],
      ),
    );
    const res = await svc.computeForAttempt({
      attemptId: 'a1',
      templateId: 't1',
      correctIds: new Set(['q1', 'q2']),
      incorrectIds: new Set(['q3']),
      unansweredIds: new Set(['q4']),
    });
    expect(res.correct).toBe(2);
    expect(res.incorrect).toBe(1);
    expect(res.unanswered).toBe(1);
    expect(res.weighted_score).toBeCloseTo(0.6, 5);
    expect(res.pct).toBe(60);
    expect(res.pass).toBe(true);
  });
});
