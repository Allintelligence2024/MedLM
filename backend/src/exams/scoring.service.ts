// ScoringService — Phase 10 bis.
//
// Score pondéré (weights par question) + barème custom par faculté.
// Avant (Phase 10) : score = correct / total.
// Maintenant (Phase 10 bis) : score = Σ(correct_i × weight_i) /
// Σ(weight_i). Une question avec weight=2 compte double.
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { examTemplates, examQuestions } from '../db/schema';
import { WeightedScoring } from './exam_templates.dto';

@Injectable()
export class ScoringService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// Calcule le score pondéré d'une tentative.
  /// Retourne à la fois le score pondéré (affiché) et le score
  /// brut (audit / debugging).
  async computeForAttempt(args: {
    attemptId: string;
    templateId: string;
    correctIds: Set<string>;
    incorrectIds: Set<string>;
    unansweredIds: Set<string>;
  }): Promise<WeightedScoring> {
    const tpl = await this.db
      .select()
      .from(examTemplates)
      .where(eq(examTemplates.id, args.templateId))
      .get();
    if (!tpl) {
      throw new Error(`template ${args.templateId} introuvable`);
    }
    const weights = (tpl.weights as Record<string, number>) ?? {};
    const questions = await this.db
      .select({ id: examQuestions.id, position: examQuestions.position })
      .from(examQuestions)
      .where(eq(examQuestions.templateId, args.templateId));
    const total = questions.length;
    if (total === 0) {
      return {
        totalQuestions: 0,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
        weighted_score: 0,
        raw_score: 0,
        pct: 0,
        pass: false,
        weights_applied: {},
      };
    }

    let weightedSum = 0;
    let totalWeight = 0;
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    const applied: Record<string, number> = {};
    for (const q of questions) {
      // Clé de pondération par défaut = question id, puis position.
      const w = weights[q.id] ?? weights[String(q.position)] ?? 1.0;
      applied[q.id] = w;
      totalWeight += w;
      if (args.correctIds.has(q.id)) {
        weightedSum += w;
        correct++;
      } else if (args.incorrectIds.has(q.id) || args.unansweredIds.has(q.id)) {
        if (args.unansweredIds.has(q.id)) unanswered++;
        else incorrect++;
      }
    }
    const weighted_score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const raw_score = total > 0 ? correct / total : 0;
    const pct = Math.round(weighted_score * 100);
    const passThreshold = parseFloat(tpl.passThreshold);
    const pass = weighted_score >= passThreshold;
    return {
      totalQuestions: total,
      correct,
      incorrect,
      unanswered,
      weighted_score,
      raw_score,
      pct,
      pass,
      weights_applied: applied,
    };
  }
}
