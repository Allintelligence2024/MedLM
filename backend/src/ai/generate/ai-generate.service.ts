// AiGenerateService — Phase 18.2 (génération de cartes assistée par LLM).
//
// Flux :
//   1. Quota journalier par utilisateur (défense coût, même en mock).
//   2. Vérification du deck cible.
//   3. Appel du provider LLM (mock par défaut — voir llm/llm.factory).
//   4. Persistance des propositions en `cards` avec status='draft'
//      (validation humaine obligatoire via le workflow Phase 11 bis :
//      draft → review → approved → published) + métadonnées de
//      provenance IA traçables.
//   5. Audit complet dans `ai_generation_jobs`.
import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../db/database.module';
import { aiGenerationJobs } from '../../db/schema/ai';
import { cards, decks } from '../../db/schema/content';
import { GeneratedCardDraft, LLM_PROVIDER, LlmProvider } from '../llm/llm.types';
import { HintsService } from '../hints/hints.service';
import { AiGenerateBody, AiGenerateResponse } from './ai-generate.dto';

export const AI_GENERATE_DEFAULT_DAILY_QUOTA = 20;

@Injectable()
export class AiGenerateService {
  private readonly logger = new Logger(AiGenerateService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly config: ConfigService,
  ) {}

  // ────────────────────────── Logique pure (testée) ───────────────────────

  /// Début du jour courant en UTC (base des quotas journaliers).
  static todayStartUtc(now: Date = new Date()): Date {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  static remainingQuota(used: number, limit: number): number {
    return Math.max(0, limit - used);
  }

  static promptHashOf(parts: string[]): string {
    return createHash('sha256').update(parts.join('')).digest('hex');
  }

  /// Mapping proposition LLM → ligne `cards` (status draft, provenance IA).
  /// Pure pour être testée sans DB.
  static toCardRow(
    draft: GeneratedCardDraft,
    ctx: {
      deckId: string;
      userId: string;
      provider: string;
      model: string;
      promptHash: string;
      lang: string;
    },
  ) {
    return {
      deckId: ctx.deckId,
      type: 'basic',
      status: 'draft',
      content: {
        front: draft.front,
        back: draft.back,
        explanation: draft.explanation,
        media: [] as string[],
      },
      sourceMeta: {
        source_type: 'ai_generated',
        provider: ctx.provider,
        model: ctx.model,
        prompt_hash: ctx.promptHash,
        lang: ctx.lang,
        generated_by: ctx.userId,
        requires_human_review: true,
      },
      tags: HintsService.normalizeTags(['ia', ...draft.tags]),
      createdBy: ctx.userId,
    };
  }

  // ────────────────────────── Orchestration DB ───────────────────────────

  async generate(args: {
    userId: string;
    body: AiGenerateBody;
    now?: Date;
  }): Promise<AiGenerateResponse> {
    const now = args.now ?? new Date();
    const limit =
      this.config.get<number>('AI_GENERATE_DAILY_QUOTA') ??
      AI_GENERATE_DEFAULT_DAILY_QUOTA;

    // 1. Quota : on compte les jobs 'ok' du jour (UTC).
    const [{ count: used }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiGenerationJobs)
      .where(
        and(
          eq(aiGenerationJobs.userId, args.userId),
          eq(aiGenerationJobs.kind, 'llm_generate'),
          eq(aiGenerationJobs.status, 'ok'),
          gte(aiGenerationJobs.createdAt, AiGenerateService.todayStartUtc(now)),
        ),
      );
    if (AiGenerateService.remainingQuota(used, limit) <= 0) {
      throw new HttpException(
        `quota journalier de génération IA atteint (${limit}/jour)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Le deck cible doit exister.
    const [deck] = await this.db
      .select({ id: decks.id })
      .from(decks)
      .where(eq(decks.id, args.body.deck_id));
    if (!deck) throw new NotFoundException('deck introuvable');

    // 3. Génération via le provider configuré (mock par défaut).
    const promptHash = AiGenerateService.promptHashOf([
      args.body.source_text,
      args.body.lang,
      String(args.body.count),
    ]);
    const result = await this.llm.generateCards({
      sourceText: args.body.source_text,
      count: args.body.count,
      lang: args.body.lang,
      title: args.body.title,
    });

    // 4. Persistance des brouillons.
    const rows = result.cards.map((c) =>
      AiGenerateService.toCardRow(c, {
        deckId: args.body.deck_id,
        userId: args.userId,
        provider: this.llm.name,
        model: result.model,
        promptHash,
        lang: args.body.lang,
      }),
    );
    const inserted = await this.db
      .insert(cards)
      .values(rows)
      .returning({ id: cards.id });
    const draftIds = inserted.map((r) => r.id);

    // 5. Audit complet.
    const [job] = await this.db
      .insert(aiGenerationJobs)
      .values({
        userId: args.userId,
        kind: 'llm_generate',
        status: 'ok',
        provider: this.llm.name,
        model: result.model,
        promptHash,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        cardIds: draftIds,
        meta: {
          deck_id: args.body.deck_id,
          requested_count: args.body.count,
          produced_count: draftIds.length,
          lang: args.body.lang,
          title: args.body.title ?? null,
        },
      })
      .returning({ id: aiGenerationJobs.id });

    this.logger.log(
      `ai-generate: user=${args.userId} job=${job!.id} drafts=${draftIds.length} ` +
        `provider=${this.llm.name}/${result.model}`,
    );

    return {
      job_id: job!.id,
      status: 'ok',
      deck_id: args.body.deck_id,
      created_draft_ids: draftIds,
      provider: this.llm.name,
      model: result.model,
      tokens: { in: result.usage.tokensIn, out: result.usage.tokensOut },
      remaining_quota_today:
        AiGenerateService.remainingQuota(used + 1, limit),
      next_step:
        'Validation humaine obligatoire : relisez les brouillons dans le CMS ' +
        '(review → approved → published) avant diffusion aux étudiants.',
    };
  }
}
