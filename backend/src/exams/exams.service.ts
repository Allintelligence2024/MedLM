// ExamsService — timer server-side, scoring, réinjection SRS.
//
// Règles (v2 §10) :
//   * Le timer est **strictement serveur**. Le client n'envoie JAMAIS
//     "j'ai commencé à 14:00" — c'est `POST /exams/attempts` qui
//     pose le `started_at = now()`.
//   * À la soumission, le serveur rejette si `now > expires_at` ET
//     le `delta` client dépasse 5s (tolérance horloge).
//   * Les questions ratées sont injectées dans le SRS (via
//     `POST /srs-sync/push` côté client OU directement par le
//     serveur, selon le design).
//
// Choix Phase 10 : on injecte côté serveur. Plus simple, garantit
// que la progression SRS est cohérente avec le score, et économise
// un round-trip au client.
import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { examAttempts, examQuestions, examAnswers, examTemplates, studySessions, srsCardState, reviewLogs, cards } from '../db/schema';
import { AnswerBody, ExamAttempt, ExamQuestion, ExamScoring, SubmitExamBody } from './exams.dto';

const TOLERANCE_SECONDS = 5;
const PASS_THRESHOLD = 0.5;

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// POST /v1/exams/attempts — démarre une tentative.
  /// Le timer est posé ICI, pas côté client.
  async start(args: { userId: string; templateId: string }): Promise<ExamAttempt> {
    // Le sujet (durée, barème) vit dans exam_templates — PAS dans
    // exam_questions (bug latent : durationMinutes y est undefined,
    // expiresAt devenait NaN en production).
    const tpl = await this.db
      .select()
      .from(examTemplates)
      .where(eq(examTemplates.id, args.templateId))
      .then((rows) => rows[0]);
    if (!tpl) throw new NotFoundException('template de sujet inconnu');

    const now = Date.now();
    const expiresAt = now + tpl.durationMinutes * 60_000;

    const attemptId = randomUUID();
    await this.db.insert(examAttempts).values({
      id: attemptId,
      userId: args.userId,
      templateId: args.templateId,
      startedAt: new Date(now),
      expiresAt: new Date(expiresAt),
      status: 'in_progress',
    });

    // Récupère les questions du template, SANS les bonnes réponses.
    const questions = await this.db
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.templateId, args.templateId));

    const publicQuestions: ExamQuestion[] = questions.map((q) => ({
      id: q.id,
      position: q.position,
      options: q.options.map((o) => ({
        id: o.id,
        fr: o.fr,
        ...(o.en !== undefined && { en: o.en }),
      })),
      correctOptionIds: [], // intentionnel : privé
      isMultiple: q.isMultiple,
    }));

    return {
      id: attemptId,
      user_id: args.userId,
      template_id: args.templateId,
      started_at: now,
      expires_at: expiresAt,
      duration_minutes: tpl.durationMinutes,
      questions: publicQuestions,
      missed_question_ids: [],
      status: 'in_progress',
    };
  }

  /// POST /v1/exams/attempts/:id/answers — sauvegarde d'une réponse.
  /// Utilisé en mode "examen progressif" : l'app peut soumettre
  /// question par question, le serveur stocke pour l'analyse.
  async saveAnswer(args: { userId: string; attemptId: string; answer: AnswerBody }) {
    const attempt = await this._loadAttempt(args.attemptId, args.userId);
    if (attempt.status !== 'in_progress') {
      throw new BadRequestException('tentative déjà soumise ou expirée');
    }
    if (Date.now() > attempt.expiresAt.getTime() + TOLERANCE_SECONDS * 1000) {
      throw new BadRequestException('temps écoulé');
    }
    await this.db.insert(examAnswers).values({
      attemptId: args.attemptId,
      questionId: args.answer.question_id,
      selected: args.answer.selected,
      durationMs: args.answer.duration_ms,
    });
  }

  /// POST /v1/exams/attempts/:id/submit — soumission finale.
  /// Calcule le score, marque les questions ratées, et **les injecte
  /// dans le SRS** (via la table `srs_card_state` + `review_logs`).
  async submit(args: {
    userId: string;
    attemptId: string;
    body: SubmitExamBody;
  }): Promise<{ scoring: ExamScoring; missed: string[]; injected: number }> {
    const attempt = await this._loadAttempt(args.attemptId, args.userId);
    if (attempt.status !== 'in_progress') {
      throw new BadRequestException('tentative déjà soumise ou expirée');
    }
    if (Date.now() > attempt.expiresAt.getTime() + TOLERANCE_SECONDS * 1000) {
      throw new BadRequestException('temps écoulé');
    }

    // Charge la vérité (les bonnes réponses) — seul le serveur les a.
    const privateQuestions = await this.db
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.templateId, attempt.templateId));

    const correctMap = new Map<string, string[]>();
    for (const q of privateQuestions) {
      // Les bonnes réponses vivent dans options[].is_correct — jamais
      // dans une colonne dédiée (correctOptionIds n'existe pas en base).
      correctMap.set(
        q.id,
        q.options.filter((o) => o.is_correct).map((o) => o.id),
      );
    }

    // Compare.
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    const missed: string[] = [];

    for (const a of args.body.answers) {
      const truth = correctMap.get(a.question_id);
      if (!truth) continue;
      if (a.selected.length === 0) {
        unanswered++;
        missed.push(a.question_id);
        continue;
      }
      const isCorrect =
        a.selected.length === truth.length &&
        [...a.selected].sort().join() === [...truth].sort().join();
      if (isCorrect) {
        correct++;
      } else {
        incorrect++;
        missed.push(a.question_id);
      }
    }

    const total = correct + incorrect + unanswered;
    const score = total === 0 ? 0 : correct / total;
    const pct = Math.round(score * 100);
    const pass = score >= PASS_THRESHOLD;

    await this.db
      .update(examAttempts)
      .set({
        status: 'submitted',
        submittedAt: new Date(Date.now()),
        score: score,
        correctCount: correct,
        incorrectCount: incorrect,
        unansweredCount: unanswered,
      })
      .where(eq(examAttempts.id, args.attemptId));

    // Réinjection SRS : pour chaque carte ratée, on enregistre un
    // ReviewEvent avec examMode=true. Le client, à la prochaine sync,
    // rejouera fold() localement. L'état SRS est mis à jour ici aussi
    // pour le serveur.
    const now = Date.now();
    let injected = 0;
    let sessionDeckId: string | null = null;
    for (const questionId of missed) {
      // Trouve la carte associée (peut être absente si l'admin n'a
      // pas encore lié la question à une carte).
      const card = await this.db
        .select({ id: cards.id, deckId: cards.deckId })
        .from(cards)
        .where(eq(cards.examQuestionId, questionId))
        .then((rows) => rows[0]);
      if (!card) continue;
      sessionDeckId = card.deckId;
      // On insère un ReviewEvent factice (kind="exam_missed") dans
      // review_logs. Le scheduler SRS le traitera comme un Again
      // et ajustera la stabilité. C'est le pattern recommandé
      // par la v2 §10.
      const eventId = randomUUID();
      await this.db.insert(reviewLogs).values({
        id: eventId,
        userId: args.userId,
        cardId: card.id,
        deviceId: 'server',
        rating: 1, // Again — vu que la question a été ratée
        durationMs: 0,
        cardType: 'qcm',
        examMode: true, // n'affecte pas la planification (cf. fold)
        reviewedAt: now,
      });
      // On bump le compteur SRS pour la visibilité.
      await this.db
        .insert(srsCardState)
        .values({
          userId: args.userId,
          cardId: card.id,
          reps: 0,
          lapses: 0,
          updatedAt: new Date(now),
        })
        .onConflictDoUpdate({
          target: [srsCardState.userId, srsCardState.cardId],
          set: { updatedAt: new Date(now) },
        });
      injected++;
    }

    // Enregistre la session d'étude (pour les stats gamification).
    await this.db.insert(studySessions).values({
      id: randomUUID(),
      userId: args.userId,
      deckId: sessionDeckId,  // exam_questions n'a pas de deckId
      startedAt: new Date(attempt.startedAt),
      endedAt: new Date(now),
      cardsDueAtStart: total,
      cardsReviewed: correct + incorrect,
      correctCount: correct,
      xpEarned: correct * 3 + (pass ? 50 : 0),
    });

    this.logger.log(
      `exam ${args.attemptId} user=${args.userId} score=${pct}% ` +
        `(${correct}/${total}) pass=${pass} injected=${injected}`,
    );

    return {
      scoring: { totalQuestions: total, correct, incorrect, unanswered, score, pct, pass },
      missed,
      injected,
    };
  }

  private async _loadAttempt(attemptId: string, userId: string) {
    const row = await this.db
      .select()
      .from(examAttempts)
      .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.userId, userId)))
      .then((rows) => rows[0]);
    if (!row) throw new NotFoundException('tentative inconnue');
    return row;
  }
}
