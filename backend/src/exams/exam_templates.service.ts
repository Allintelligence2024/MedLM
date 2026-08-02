// ExamTemplatesService — Phase 10 bis + Phase 14.
//
// Responsabilités :
//   * listTemplates() : templates actifs, filtrés par faculté/année.
//   * generateAttempt() : démarre une tentative depuis un template
//     en piochant N cartes/questions au hasard parmi celles du
//     module ciblé (ou multi-module si NULL).
//   * recordCheatEvent() : log append-only d'un événement.
//   * suspicionScore() : score agrégé (0..1) d'une tentative, basé
//     sur les événements. 0 = RAS, 1 = très suspect.
//   * (Phase 14) detectMultiDevice() : signale les examens passés
//     simultanément depuis plusieurs appareils (triche probable).
import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { examTemplates, examAttemptEvents, examQuestions, examAttempts, cards, decks } from '../db/schema';

const TOLERANCE_SECONDS = 5;

@Injectable()
export class ExamTemplatesService {

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// GET /v1/exams/templates — liste filtrée.
  async listTemplates(args: {
    moduleId?: string;
    faculty?: string;
    studyYear?: number;
  }) {
    const conds = [eq(examTemplates.isActive, true)];
    if (args.moduleId) conds.push(eq(examTemplates.moduleId, args.moduleId));
    if (args.faculty) conds.push(eq(examTemplates.faculty, args.faculty));
    if (args.studyYear !== undefined) conds.push(eq(examTemplates.studyYear, args.studyYear));
    return this.db
      .select()
      .from(examTemplates)
      .where(and(...conds));
  }

  /// Génère une tentative à partir d'un template. Crée les
  /// `exam_questions` à la volée en piochant `total_questions`
  /// cartes du module.
  async generateAttempt(args: { userId: string; templateId: string }) {
    const tpl = await this.db
      .select()
      .from(examTemplates)
      .where(eq(examTemplates.id, args.templateId))
      .then((rows) => rows[0]);
    if (!tpl) throw new NotFoundException('template inconnu');
    if (!tpl.isActive) throw new BadRequestException('template inactif');

    // 1. Pioche aléatoire des cartes du module.
    // Drizzle better-sqlite3 ne supporte pas `ORDER BY random()`
    // portable. On fait un SELECT puis shuffle en mémoire.
    const pool = tpl.moduleId
      ? await this.db
          .select({ id: cards.id })
          .from(cards)
          .innerJoin(decks, eq(cards.deckId, decks.id))
          .where(eq(decks.moduleId, tpl.moduleId))
      : await this.db.select({ id: cards.id }).from(cards);
    if (pool.length < tpl.totalQuestions) {
      throw new BadRequestException(
        `pool insuffisant : ${pool.length} cartes pour ${tpl.totalQuestions} demandées`,
      );
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, tpl.totalQuestions);

    // 2. Crée l'attempt avec timer serveur.
    const attemptId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + tpl.durationMinutes * 60_000;
    await this.db.insert(examAttempts).values({
      id: attemptId,
      userId: args.userId,
      templateId: tpl.id,
      startedAt: new Date(now),
      expiresAt: new Date(expiresAt),
      status: 'in_progress',
    });

    // 3. Crée les questions d'examen à partir des cartes piochées.
    // Les questions publiques sont renvoyées immédiatement : l'écran mobile
    // ne peut pas démarrer un examen avec une simple liste de métadonnées.
    const publicQuestions: Array<{
      id: string;
      position: number;
      options: Array<{ id: string; fr: string }>;
      is_multiple: boolean;
    }> = [];
    for (let i = 0; i < picked.length; i++) {
      const card = picked[i];
      if (!card) continue;  // noUncheckedIndexedAccess
      // On prend la carte et on sérialise son contenu (FR/EN) en
      // QCM. En l'absence d'options structurées, on génère 4
      // options (1 correcte + 3 distracteurs pris dans la même
      // catégorie). C'est minimaliste — un vrai générateur viendra
      // avec le CMS (Phase 11 bis).
      const full = await this.db
        .select()
        .from(cards)
        .where(eq(cards.id, card.id))
        .then((rows) => rows[0]);
      if (!full) continue;
      // Le contenu est dans un JSONB, on l'extrait.
      const content = (full as any).content ?? {};
      const front = content?.front ?? 'carte';
      const correctOptionId = 'opt_' + Math.random().toString(36).slice(2, 8);
      const options = [
        { id: correctOptionId, fr: typeof front === 'string' ? front : JSON.stringify(front), is_correct: true },
        { id: 'opt_d1', fr: '—', is_correct: false },
        { id: 'opt_d2', fr: '—', is_correct: false },
        { id: 'opt_d3', fr: '—', is_correct: false },
      ];
      const [question] = await this.db.insert(examQuestions).values({
        templateId: tpl.id,
        cardId: full.id,
        position: i + 1,
        options,
        isMultiple: false,
      }).returning({ id: examQuestions.id });
      if (!question) throw new Error('création de question d\'examen échouée');
      publicQuestions.push({
        id: question.id,
        position: i + 1,
        options: options.map(({ id, fr }) => ({ id, fr })),
        is_multiple: false,
      });
    }

    return {
      attempt_id: attemptId,
      started_at: now,
      expires_at: expiresAt,
      duration_minutes: tpl.durationMinutes,
      total_questions: tpl.totalQuestions,
      questions: publicQuestions,
    };
  }

  /// POST /v1/exams/attempts/:id/events — log anti-triche.
  async recordCheatEvent(args: {
    userId: string;
    attemptId: string;
    kind: string;
    metadata: Record<string, unknown>;
    clientTs: number;
  }): Promise<{ serverTs: number }> {
    // Vérifier que la tentative existe et est en cours.
    const attempt = await this.db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, args.attemptId))
      .then((rows) => rows[0]);
    if (!attempt) throw new NotFoundException('tentative inconnue');
    if (attempt.userId !== args.userId) {
      throw new BadRequestException('cette tentative n\'est pas la vôtre');
    }
    if (attempt.status !== 'in_progress') {
      throw new BadRequestException('tentative déjà soumise ou expirée');
    }
    if (attempt.expiresAt.getTime() + TOLERANCE_SECONDS * 1000 < Date.now()) {
      throw new BadRequestException('temps écoulé');
    }
    await this.db.insert(examAttemptEvents).values({
      attemptId: args.attemptId,
      userId: args.userId,
      kind: args.kind,
      metadata: args.metadata as object,
      clientTs: args.clientTs,
    });
    return { serverTs: Date.now() };
  }

  /// Calcule un score de suspicion (0..1) basé sur les événements
  /// anti-triche. 0 = RAS, 1 = très suspect.
  /// Pondération :
  ///   * focus_loss > 5s : +0.2
  ///   * paste : +0.3 (par événement, capé à 0.6)
  ///   * switch_tab : +0.1 (par événement, capé à 0.4)
  ///   * screenshot : +0.5
  ///   * right_click : +0.05 (par événement, capé à 0.2)
  async suspicionScore(attemptId: string): Promise<number> {
    const rows = await this.db
      .select({ kind: examAttemptEvents.kind, metadata: examAttemptEvents.metadata })
      .from(examAttemptEvents)
      .where(eq(examAttemptEvents.attemptId, attemptId));
    let score = 0;
    let focusLossMs = 0;
    let pastes = 0;
    let switches = 0;
    let rightClicks = 0;
    let screenshots = 0;
    for (const r of rows) {
      const meta = (r.metadata as any) ?? {};
      switch (r.kind) {
        case 'focus_loss':
          focusLossMs += (meta.duration_ms as number) ?? 0;
          break;
        case 'paste':
          pastes++;
          break;
        case 'switch_tab':
          switches++;
          break;
        case 'right_click':
          rightClicks++;
          break;
        case 'screenshot':
          screenshots++;
          break;
        case 'focus_gain':
        case 'copy':
          break;
      }
    }
    if (focusLossMs > 5_000) score += 0.2;
    if (pastes > 0) score += Math.min(0.3 * pastes, 0.6);
    if (switches > 0) score += Math.min(0.1 * switches, 0.4);
    if (screenshots > 0) score += 0.5;
    if (rightClicks > 0) score += Math.min(0.05 * rightClicks, 0.2);

    // Phase 14 : multi-device.
    const multiDevice = await this.detectMultiDevice(attemptId);
    if (multiDevice.distinctDevices > 1) {
      // 0.4 par device supplémentaire, capé à 0.8.
      score += Math.min(0.4 * (multiDevice.distinctDevices - 1), 0.8);
    }

    return Math.min(score, 1.0);
  }

  /// Détecte les examens passés depuis plusieurs appareils pour un
  /// même user. On regarde les `examAttemptEvents` qui contiennent
  /// un `device_id` dans leur `metadata` et on compte les devices
  /// distincts.
  ///
  /// Approche : pour chaque event d'une tentative, on regarde si
  /// le `userId` a d'autres tentatives en cours (ou récentes) avec
  /// un `deviceId` différent. Si oui, c'est suspect.
  async detectMultiDevice(attemptId: string): Promise<{ distinctDevices: number; deviceIds: string[] }> {
    const me = await this.db
      .select({ userId: examAttempts.userId, startedAt: examAttempts.startedAt })
      .from(examAttempts)
      .where(eq(examAttempts.id, attemptId))
      .then((rows) => rows[0]);
    if (!me) return { distinctDevices: 0, deviceIds: [] };

    // Toutes les tentatives en cours de ce user, dans la même
    // fenêtre temporelle (± 30 minutes du début de la tentative).
    const windowStart = new Date(me.startedAt.getTime() - 30 * 60_000);
    const windowEnd = new Date(me.startedAt.getTime() + 30 * 60_000);
    const concurrent = await this.db
      .select({ id: examAttempts.id })
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.userId, me.userId),
          sql`${examAttempts.startedAt} >= ${windowStart.toISOString()}`,
          sql`${examAttempts.startedAt} <= ${windowEnd.toISOString()}`,
        ),
      );
    if (concurrent.length === 0) {
      return { distinctDevices: 0, deviceIds: [] };
    }
    const ids = concurrent.map((c) => c.id);
    // Pour chaque tentative concurrente, on récupère les device_id
    // depuis examAttemptEvents.metadata.device_id.
    const events = await this.db
      .select({ metadata: examAttemptEvents.metadata })
      .from(examAttemptEvents)
      // inArray : bind paramétré (= ANY($n)) — types uuid vérifiés
      // par drizzle, aucune interpolation manuelle (injection, et le
      // triplement imbriqué de gabarits ne compilait pas : TS1160).
      .where(inArray(examAttemptEvents.attemptId, ids));
    const devices = new Set<string>();
    for (const e of events) {
      const m = (e.metadata as any) ?? {};
      if (typeof m.device_id === 'string' && m.device_id) {
        devices.add(m.device_id);
      }
    }
    return { distinctDevices: devices.size, deviceIds: [...devices] };
  }
}
