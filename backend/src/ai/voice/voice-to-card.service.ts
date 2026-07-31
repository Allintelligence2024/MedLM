// VoiceToCardService — Phase 18.3 (voice-to-card).
//
// Flux : l'étudiant dicte une question à voix haute → transcription
// (client STT de préférence, ou TranscriberProvider serveur) → formatage
// en carte (règles pures, card-formatter.ts) → persistance en brouillon
// (`status='draft'`, `source_type='voice_to_card'`) pour révision par
// l'auteur — prise de notes rapide en amphi.
//
// Choix RBAC assumé : l'endpoint est ouvert à tout utilisateur authentifié
// (JwtGuard seul). Le brouillon n'est JAMAIS publié automatiquement : le
// workflow CMS (review → approved → published) garde la main à un auteur.
// C'est le cahier de brouillon de l'étudiant, pas un canal de publication.
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
import { HintsService } from '../hints/hints.service';
import { AiGenerateService } from '../generate/ai-generate.service';
import { TRANSCRIBER_PROVIDER, TranscriberProvider } from './transcriber.types';
import { FormattedCard, formatTranscriptToCard } from './card-formatter';
import { VoiceToCardBody, VoiceToCardResponse } from './voice-to-card.dto';

export const AI_VOICE_DEFAULT_DAILY_QUOTA = 50;

@Injectable()
export class VoiceToCardService {
  private readonly logger = new Logger(VoiceToCardService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(TRANSCRIBER_PROVIDER)
    private readonly transcriber: TranscriberProvider,
    private readonly config: ConfigService,
  ) {}

  // ────────────────────────── Logique pure (testée) ───────────────────────

  /// Mapping → ligne `cards` : draft + provenance vocale traçable.
  static toCardRow(
    formatted: FormattedCard,
    ctx: {
      deckId: string;
      userId: string;
      transcriber: string;
      model: string;
      confidence: number;
      lang: string;
      transcriptHash: string;
    },
  ) {
    return {
      deckId: ctx.deckId,
      type: 'basic',
      status: 'draft',
      content: {
        front: formatted.front,
        back: formatted.back,
        explanation: formatted.explanation,
        media: [] as string[],
      },
      sourceMeta: {
        source_type: 'voice_to_card',
        transcriber: ctx.transcriber,
        model: ctx.model,
        confidence: ctx.confidence,
        lang: ctx.lang,
        transcript_hash: ctx.transcriptHash,
        format_rule: formatted.rule,
        generated_by: ctx.userId,
        requires_human_review: true,
      },
      tags: HintsService.normalizeTags(formatted.tags),
      createdBy: ctx.userId,
    };
  }

  // ────────────────────────── Orchestration DB ───────────────────────────

  async submit(args: {
    userId: string;
    body: VoiceToCardBody;
    now?: Date;
  }): Promise<VoiceToCardResponse> {
    const now = args.now ?? new Date();
    const limit =
      this.config.get<number>('AI_VOICE_DAILY_QUOTA') ??
      AI_VOICE_DEFAULT_DAILY_QUOTA;

    // 1. Quota journalier (jour UTC, jobs 'ok').
    const [{ count: used }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiGenerationJobs)
      .where(
        and(
          eq(aiGenerationJobs.userId, args.userId),
          eq(aiGenerationJobs.kind, 'voice_to_card'),
          eq(aiGenerationJobs.status, 'ok'),
          gte(aiGenerationJobs.createdAt, AiGenerateService.todayStartUtc(now)),
        ),
      );
    if (AiGenerateService.remainingQuota(used, limit) <= 0) {
      throw new HttpException(
        `quota journalier voice-to-card atteint (${limit}/jour)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Deck cible.
    const [deck] = await this.db
      .select({ id: decks.id })
      .from(decks)
      .where(eq(decks.id, args.body.deck_id));
    if (!deck) throw new NotFoundException('deck introuvable');

    // 3. Transcription : client STT en priorité (pas d'upload audio).
    let transcript: string;
    let transcribeMeta: { provider: string; model: string; confidence: number };
    if (args.body.audio_transcript != null) {
      transcript = args.body.audio_transcript;
      transcribeMeta = { provider: 'client-stt', model: 'client', confidence: 1.0 };
    } else {
      const t = await this.transcriber.transcribe({
        audioBase64: args.body.audio_base64!,
        lang: args.body.lang,
      });
      transcript = t.text;
      transcribeMeta = { provider: this.transcriber.name, model: t.model, confidence: t.confidence };
    }

    // 4. Formatage en carte (règles pures).
    const formatted = formatTranscriptToCard(transcript, args.body.lang);
    const transcriptHash = AiGenerateService.promptHashOf([transcript]);

    // 5. Persistance brouillon + audit.
    const row = VoiceToCardService.toCardRow(formatted, {
      deckId: args.body.deck_id,
      userId: args.userId,
      transcriber: transcribeMeta.provider,
      model: transcribeMeta.model,
      confidence: transcribeMeta.confidence,
      lang: args.body.lang,
      transcriptHash,
    });
    const [draft] = await this.db.insert(cards).values(row).returning({ id: cards.id });

    const [job] = await this.db
      .insert(aiGenerationJobs)
      .values({
        userId: args.userId,
        kind: 'voice_to_card',
        status: 'ok',
        provider: transcribeMeta.provider,
        model: transcribeMeta.model,
        promptHash: transcriptHash,
        tokensIn: Math.ceil(transcript.length / 4),
        tokensOut: 0,
        cardIds: [draft!.id],
        meta: {
          deck_id: args.body.deck_id,
          lang: args.body.lang,
          format_rule: formatted.rule,
          client_stt: args.body.audio_transcript != null,
        },
      })
      .returning({ id: aiGenerationJobs.id });

    this.logger.log(
      `voice-to-card: user=${args.userId} job=${job!.id} draft=${draft!.id} rule=${formatted.rule}`,
    );

    return {
      job_id: job!.id,
      draft_id: draft!.id,
      transcript,
      formatted: { front: formatted.front, back: formatted.back, rule: formatted.rule },
      transcriber: transcribeMeta,
      lang: args.body.lang,
      remaining_quota_today: AiGenerateService.remainingQuota(used + 1, limit),
      next_step:
        'Brouillon enregistré. Un auteur le relira avant publication ' +
        '(draft → review → approved → published).',
    };
  }
}
