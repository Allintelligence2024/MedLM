// TutorService — Phase 18.6 (voice tutoring / chatbot pédagogique).
//
// L'étudiant pose une question (texte ou dictée transcrite côté mobile).
// Le tuteur répond via le LlmProvider configuré (mock par défaut), sous
// un cadre pédagogique strict — voir tutor.policy.ts pour les règles
// de conformité (disclaimer obligatoire, urgences, périmètre, audit).
//
// « Voice » : le backend est texte. Le mobile transcrit la question
// (STT) puis lit la réponse (TTS) — la réponse CONTIENT le disclaimer,
// donc la conformité tient aussi à l'oral.
import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../db/database.module';
import { aiGenerationJobs, aiTutorPrompts } from '../../db/schema/ai';
import { ChatMessage, LLM_PROVIDER, LlmLang, LlmProvider } from '../llm/llm.types';
import { AiGenerateService } from '../generate/ai-generate.service';
import {
  EMERGENCY_ADVICE,
  MEDICAL_DISCLAIMER,
  OUT_OF_SCOPE_REPLY,
  buildSystemPrompt,
  detectEmergency,
  isWithinMedicalScope,
} from './tutor.policy';
import { TutorAskBody, TutorAskResponse } from './tutor.dto';

export const AI_TUTOR_DEFAULT_DAILY_QUOTA = 30;

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────── Logique pure (testée) ──────────────────────────

  static sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /// Assemblage de la réponse finale. Le disclaimer est TOUJOURS le
  /// dernier bloc, l'avis d'urgence TOUJOURS le premier — l'ordre est
  /// invariant et testé.
  static composeFinalAnswer(args: {
    body: string;
    emergency: boolean;
    lang: LlmLang;
  }): string {
    const head = args.emergency ? `${EMERGENCY_ADVICE[args.lang]}\n\n` : '';
    return `${head}${args.body.trim()}\n\n${MEDICAL_DISCLAIMER[args.lang]}`;
  }

  static messagesFor(args: {
    question: string;
    lang: LlmLang;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): ChatMessage[] {
    return [
      { role: 'system', content: buildSystemPrompt(args.lang) },
      ...args.history.slice(-10),
      { role: 'user', content: args.question },
    ];
  }

  // ─────────────────────── Orchestration DB ────────────────────────────────

  async ask(args: {
    userId: string;
    body: TutorAskBody;
    now?: Date;
  }): Promise<TutorAskResponse> {
    const now = args.now ?? new Date();
    const limit =
      this.config.get<number>('AI_TUTOR_DAILY_QUOTA') ??
      AI_TUTOR_DEFAULT_DAILY_QUOTA;
    const { question, lang, history } = args.body;

    // 1. Quota (jour UTC, jobs 'ok').
    const [{ count: used }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiGenerationJobs)
      .where(
        and(
          eq(aiGenerationJobs.userId, args.userId),
          eq(aiGenerationJobs.kind, 'tutor_ask'),
          eq(aiGenerationJobs.status, 'ok'),
          gte(aiGenerationJobs.createdAt, AiGenerateService.todayStartUtc(now)),
        ),
      );
    if (AiGenerateService.remainingQuota(used, limit) <= 0) {
      throw new HttpException(
        `quota journalier du tuteur atteint (${limit}/jour)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Policy : urgences et périmètre.
    const emergency = detectEmergency(question);
    const withinScope = isWithinMedicalScope(question);

    // 3. Réponse du LLM (jamais appelé hors sujet — économie directe).
    let body: string;
    let model = this.llm.model;
    let tokensIn = 0;
    let tokensOut = 0;
    if (!withinScope) {
      body = OUT_OF_SCOPE_REPLY[lang];
      model = 'policy-guard';
    } else {
      const res = await this.llm.chat({
        messages: TutorService.messagesFor({ question, lang, history }),
      });
      body = res.text;
      model = res.model;
      tokensIn = res.usage.tokensIn;
      tokensOut = res.usage.tokensOut;
    }

    // 4. Assemblage : urgence en tête, disclaimer en clôture — invariant.
    const answer = TutorService.composeFinalAnswer({
      body,
      emergency,
      lang,
    });

    // 5. Audit append-only de l'échange + compteur de quota.
    await this.db.insert(aiTutorPrompts).values({
      userId: args.userId,
      question,
      questionHash: TutorService.sha256(question),
      lang,
      provider: this.llm.name,
      model,
      answer,
      responseHash: TutorService.sha256(answer),
      withinScope,
      emergency,
      tokensIn,
      tokensOut,
    });
    await this.db.insert(aiGenerationJobs).values({
      userId: args.userId,
      kind: 'tutor_ask',
      status: 'ok',
      provider: this.llm.name,
      model,
      promptHash: TutorService.sha256(question),
      tokensIn,
      tokensOut,
      meta: { emergency, within_scope: withinScope, lang },
    });

    this.logger.log(
      `tutor ask: user=${args.userId} provider=${this.llm.name} emergency=${emergency} scope=${withinScope}`,
    );

    return {
      answer,
      disclaimer: MEDICAL_DISCLAIMER[lang],
      emergency,
      within_scope: withinScope,
      provider: this.llm.name,
      model,
      remaining_quota_today: AiGenerateService.remainingQuota(used + 1, limit),
    };
  }
}
