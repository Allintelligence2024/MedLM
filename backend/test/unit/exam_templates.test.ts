// Tests ExamTemplatesService — Phase 10 bis.
import { describe, it, expect } from 'vitest';
import { ScoringService } from '../../src/exams/scoring.service';

describe('ScoringService — scoring pondéré', () => {
  it('retourne 0 si pas de questions', async () => {
    // On injecte une DB mock qui retourne 0 questions.
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({ get: async () => null }),
        }),
      }),
    } as any;
    const svc = new ScoringService(fakeDb);
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
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({ get: async () => null }),
        }),
      }),
    } as any;
    // On simule 4 questions, weight de q2 = 2, q1=q2=q3=q4 weight=1.
    // L'utilisateur a juste q1 et q2 correctes.
    // Score = (1 + 2) / (1 + 2 + 1 + 1) = 3/5 = 0.6 → 60% → pass.
    const svc = new ScoringService(fakeDb);
    // Stub template + questions via spyOn.
    (svc as any).db = {
      select: () => ({
        from: (t: any) => ({
          where: () => {
            // Premier call = template, deuxième = questions.
            if ((t as any)?.name === 'exam_templates' || true) {
              // On triche en utilisant un compteur.
            }
            return { get: async () => ({ id: 't1', weights: { q2: 2 }, passThreshold: '0.5' }) };
          },
        }),
      }),
      // Pour la 2e select (questions) :
      select2: () => [
        { id: 'q1', position: 1 },
        { id: 'q2', position: 2 },
        { id: 'q3', position: 3 },
        { id: 'q4', position: 4 },
      ],
    } as any;
    // Patch pour retourner un array plutôt qu'un get().
    (svc as any).db.select = () => ({
      from: (t: any) => ({
        where: async () => {
          if (t?.name === 'exam_templates' || String(t).includes('exam_templates')) {
            return [{ id: 't1', weights: { q2: 2 }, passThreshold: '0.5' }];
          }
          return [
            { id: 'q1', position: 1 },
            { id: 'q2', position: 2 },
            { id: 'q3', position: 3 },
            { id: 'q4', position: 4 },
          ];
        },
      }),
    });
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
    // Score = 3 / 5 = 0.6 → 60% → pass.
    expect(res.weighted_score).toBeCloseTo(0.6, 5);
    expect(res.pct).toBe(60);
    expect(res.pass).toBe(true);
  });
});
