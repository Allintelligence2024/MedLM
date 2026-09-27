/// Service Content — lectures apprenant, CMS, signalements, workflow.
///
/// Phase 2 : les lectures apprenant ne voient que du publié ; le premium
/// exige un entitlement actif. Les transitions sont autorisées par rôle.
/// L'auto-approbation est interdite, y compris pour un administrateur
/// sauf dérogation explicite et auditée.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { cards, cardReports, cardVersions, decks, modules } from "../db/schema";
import { auditLog } from "../db/schema/billing";
import { DRIZZLE, Database } from "../db/database.module";
import type { UpdateCardBody } from "./content.dto";
import { BillingService } from "../billing/billing.service";
import {
  cmsListScope,
  decideCardEdit,
  decideCardRead,
  decideLearnerDeckRead,
  decideTransition,
  type AccessDecision,
  type ContentActor,
} from "./content-policy";
import {
  MEDIA_PRESIGNER,
  MediaStorageError,
  envMediaPresigner,
  type MediaPresigner,
} from "./media-storage";

export interface DeckListItem {
  id: string;
  module_id: string;
  module_name_fr: string;
  name_fr: string;
  name_en: string;
  description_fr: string;
  is_premium: boolean;
  version: number;
  card_count: number;
  cover_image_key: string | null;
  published_at: string | null;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly media: MediaPresigner;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly billing: BillingService,
    @Optional()
    @Inject(MEDIA_PRESIGNER)
    media: MediaPresigner | null = null,
  ) {
    this.media = media ?? envMediaPresigner();
  }

  /// GET /content/decks — catalogue apprenant : decks effectivement publiés.
  /// Un deck premium reste visible (paywall) ; son contenu est refusé plus bas.
  async listDecks(args: {
    moduleId?: string;
    versionSince: number;
    limit: number;
  }): Promise<{ items: DeckListItem[]; next_cursor_version: number }> {
    const where = args.moduleId
      ? and(
          isNotNull(decks.publishedAt),
          gte(decks.version, args.versionSince),
          eq(decks.moduleId, args.moduleId),
        )
      : and(
          isNotNull(decks.publishedAt),
          gte(decks.version, args.versionSince),
        );

    const rows = await this.db
      .select({
        id: decks.id,
        moduleId: decks.moduleId,
        moduleNameFr: modules.nameFr,
        nameFr: decks.nameFr,
        nameEn: decks.nameEn,
        descriptionFr: decks.descriptionFr,
        isPremium: decks.isPremium,
        version: decks.version,
        cardCount: decks.cardCount,
        coverImageKey: decks.coverImageKey,
        publishedAt: decks.publishedAt,
      })
      .from(decks)
      .innerJoin(modules, eq(modules.id, decks.moduleId))
      .where(where)
      .orderBy(decks.version)
      .limit(args.limit + 1);

    const hasMore = rows.length > args.limit;
    const page = rows.slice(0, args.limit);

    return {
      items: page.map((r) => ({
        id: r.id,
        module_id: r.moduleId,
        module_name_fr: r.moduleNameFr,
        name_fr: r.nameFr,
        name_en: r.nameEn,
        description_fr: r.descriptionFr,
        is_premium: r.isPremium,
        version: r.version,
        card_count: r.cardCount,
        cover_image_key: r.coverImageKey,
        published_at: r.publishedAt?.toISOString() ?? null,
      })),
      next_cursor_version: hasMore
        ? page[page.length - 1]!.version
        : args.versionSince,
    };
  }

  /// GET /content/decks/:id/cards — cartes PUBLIÉES uniquement.
  async listDeckCards(args: {
    actor: ContentActor;
    deckId: string;
    versionSince: number;
    limit: number;
  }): Promise<{
    items: Array<{
      id: string;
      deck_id: string;
      type: string;
      version: number;
      content: unknown;
      source_meta: unknown;
      tags: string[];
      difficulty_hint: number | null;
      is_premium: boolean;
      published_at: string | null;
    }>;
    next_cursor_version: number;
  }> {
    const deck = await this.db
      .select({
        id: decks.id,
        version: decks.version,
        isPremium: decks.isPremium,
        publishedAt: decks.publishedAt,
      })
      .from(decks)
      .where(eq(decks.id, args.deckId))
      .then((rows) => rows[0]);
    if (!deck) throw new NotFoundException(`deck ${args.deckId} introuvable`);

    const entitled = await this.isEntitled(args.actor.userId);
    this.enforce(
      decideLearnerDeckRead(
        args.actor,
        { publishedAt: deck.publishedAt, isPremium: deck.isPremium },
        entitled,
      ),
      "deck introuvable",
    );

    const rows = await this.db
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.deckId, args.deckId),
          eq(cards.status, "published"),
          gte(cards.version, args.versionSince),
        ),
      )
      .orderBy(cards.version)
      .limit(args.limit + 1);

    const hasMore = rows.length > args.limit;
    const page = rows.slice(0, args.limit);

    return {
      items: page.map((r) => ({
        id: r.id,
        deck_id: r.deckId,
        type: r.type,
        version: r.version,
        content: r.content,
        source_meta: r.sourceMeta,
        tags: r.tags,
        difficulty_hint: r.difficultyHint,
        is_premium: r.isPremium,
        published_at: r.publishedAt?.toISOString() ?? null,
      })),
      next_cursor_version: hasMore
        ? page[page.length - 1]!.version
        : args.versionSince,
    };
  }

  /// GET /content/cards/list — vue CMS. Un auteur ne voit que SES cartes.
  async listCardsForCms(args: {
    actor: ContentActor;
    moduleId?: string;
    limit: number;
  }) {
    const scope = cmsListScope(args.actor);
    if (scope === "none") {
      throw new ForbiddenException("lecture éditoriale réservée au staff");
    }
    const projection = {
      id: cards.id,
      deckId: cards.deckId,
      type: cards.type,
      status: cards.status,
      version: cards.version,
      isPremium: cards.isPremium,
      publishedAt: cards.publishedAt,
      updatedAt: cards.updatedAt,
      content: cards.content,
    };
    const rows =
      scope === "own"
        ? await this.db
            .select(projection)
            .from(cards)
            .where(eq(cards.createdBy, args.actor.userId))
            .orderBy(desc(cards.updatedAt))
            .limit(args.limit)
        : await this.db
            .select(projection)
            .from(cards)
            .orderBy(desc(cards.updatedAt))
            .limit(args.limit);
    return {
      items: rows.map((r) => ({
        id: r.id,
        deck_id: r.deckId,
        type: r.type,
        status: r.status,
        version: r.version,
        is_premium: r.isPremium,
        published_at: r.publishedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? new Date().toISOString(),
        title: this._extractTitle(r.content),
      })),
    };
  }

  /// GET /content/cards/:id
  async getCard(args: { actor: ContentActor; cardId: string }) {
    const row = await this.loadCardWithDeck(args.cardId);
    if (!row) throw new NotFoundException("carte introuvable");
    const entitled = await this.isEntitled(args.actor.userId);
    this.enforce(
      decideCardRead(
        args.actor,
        {
          status: row.status,
          isPremium: row.isPremium,
          createdBy: row.createdBy,
          deckIsPremium: row.deckIsPremium,
        },
        entitled,
      ),
      "carte introuvable",
    );
    const c = (row.content as Record<string, unknown> | null) ?? {};
    const s = (row.sourceMeta as Record<string, unknown> | null) ?? {};
    return {
      id: row.id,
      deck_id: row.deckId,
      type: row.type,
      status: row.status,
      version: row.version,
      is_premium: row.isPremium,
      published_at: row.publishedAt?.toISOString() ?? null,
      updated_at: row.updatedAt?.toISOString() ?? new Date().toISOString(),
      content: {
        front_fr: typeof c.front_fr === "string" ? c.front_fr : "",
        back_fr: typeof c.back_fr === "string" ? c.back_fr : "",
        front_en: typeof c.front_en === "string" ? c.front_en : "",
        back_en: typeof c.back_en === "string" ? c.back_en : "",
        explanation_fr:
          typeof c.explanation_fr === "string" ? c.explanation_fr : "",
        explanation_en:
          typeof c.explanation_en === "string" ? c.explanation_en : "",
        media: Array.isArray(c.media) ? c.media : [],
      },
      source: {
        type: typeof s.type === "string" ? s.type : "original",
        faculty: typeof s.faculty === "string" ? s.faculty : "",
        year: typeof s.year === "number" ? s.year : null,
        can_distribute_offline:
          typeof s.can_distribute_offline === "boolean"
            ? s.can_distribute_offline
            : true,
        license: typeof s.license === "string" ? s.license : "",
      },
      tags: row.tags ?? [],
    };
  }

  /// PATCH /content/cards/:id
  async updateCard(args: {
    actor: ContentActor;
    cardId: string;
    body: UpdateCardBody;
  }) {
    const existing = await this.db
      .select({
        id: cards.id,
        version: cards.version,
        status: cards.status,
        createdBy: cards.createdBy,
        content: cards.content,
      })
      .from(cards)
      .where(eq(cards.id, args.cardId))
      .then((rows) => rows[0]);
    if (!existing) throw new NotFoundException("carte introuvable");
    this.enforce(
      decideCardEdit(args.actor, {
        status: existing.status,
        createdBy: existing.createdBy,
      }),
      "carte introuvable",
    );

    const nextStatus =
      existing.status === "published" ? "draft" : existing.status;
    const nextVersion = existing.version + 1;
    await this.db.transaction(async (tx) => {
      await tx.insert(cardVersions).values({
        cardId: existing.id,
        version: existing.version,
        contentSnapshot: existing.content,
        changedBy: args.actor.userId,
      });
      await tx
        .update(cards)
        .set({
          content: args.body.content,
          sourceMeta: args.body.source,
          tags: args.body.tags,
          version: nextVersion,
          updatedAt: new Date(),
          status: nextStatus,
        })
        .where(eq(cards.id, args.cardId));
      await tx.insert(auditLog).values({
        actorUserId: args.actor.userId,
        action: "content.card.update",
        targetType: "card",
        targetId: args.cardId,
        metadata: { version: nextVersion, status: nextStatus },
      });
    });
    this.logger.log(
      `card updated: ${args.cardId} v${nextVersion} by user=${args.actor.userId}`,
    );
    return { id: args.cardId, version: nextVersion };
  }

  /// POST /content/cards/:id/transition
  async transitionCard(args: {
    actor: ContentActor;
    cardId: string;
    to: string;
    comment?: string;
    adminOverride?: boolean;
  }) {
    const existing = await this.db
      .select({
        id: cards.id,
        status: cards.status,
        version: cards.version,
        createdBy: cards.createdBy,
        reviewedBy: cards.reviewedBy,
        publishedAt: cards.publishedAt,
        content: cards.content,
        deckId: cards.deckId,
      })
      .from(cards)
      .where(eq(cards.id, args.cardId))
      .then((rows) => rows[0]);
    if (!existing) throw new NotFoundException("carte introuvable");

    const decision = decideTransition({
      from: existing.status,
      to: args.to,
      actor: args.actor,
      ownerId: existing.createdBy,
      adminOverride: Boolean(args.adminOverride),
    });
    if (!decision.ok) {
      switch (decision.reason) {
        case "illegal_transition":
          throw new BadRequestException(
            `transition ${existing.status} → ${args.to} interdite`,
          );
        case "self_approval":
          throw new ForbiddenException("auto-approbation interdite");
        case "override_forbidden":
          throw new ForbiddenException(
            "dérogation réservée à un administrateur",
          );
        default:
          throw new ForbiddenException("transition non autorisée pour ce rôle");
      }
    }

    const now = new Date();
    const nextVersion = existing.version + 1;
    const publishedAt =
      args.to === "published"
        ? now
        : args.to === "retired"
          ? existing.publishedAt
          : null;
    await this.db.transaction(async (tx) => {
      await tx.insert(cardVersions).values({
        cardId: existing.id,
        version: existing.version,
        contentSnapshot: existing.content,
        changedBy: args.actor.userId,
      });
      await tx
        .update(cards)
        .set({
          status: args.to,
          version: nextVersion,
          updatedAt: now,
          publishedAt,
          reviewedBy:
            args.to === "approved" ? args.actor.userId : existing.reviewedBy,
        })
        .where(eq(cards.id, args.cardId));
      if (args.to === "published") {
        await tx
          .update(decks)
          .set({ publishedAt: now })
          .where(and(eq(decks.id, existing.deckId), isNull(decks.publishedAt)));
      }
      await tx.insert(auditLog).values({
        actorUserId: args.actor.userId,
        action: decision.requiresOverride
          ? "content.card.admin_override"
          : "content.card.transition",
        targetType: "card",
        targetId: args.cardId,
        metadata: {
          from: existing.status,
          to: args.to,
          comment: args.comment ?? null,
          admin_override: Boolean(args.adminOverride),
        },
      });
    });
    this.logger.log(
      `card transition: ${args.cardId} ${existing.status} → ${args.to} by user=${args.actor.userId}`,
    );
    return { id: args.cardId, from: existing.status, to: args.to };
  }

  /// POST /content/cards/:id/report — uniquement sur une carte lisible.
  async reportCard(args: {
    actor: ContentActor;
    cardId: string;
    reason: string;
    comment: string;
  }): Promise<{ id: string }> {
    const row = await this.loadCardWithDeck(args.cardId);
    if (!row) throw new NotFoundException("carte introuvable");
    const entitled = await this.isEntitled(args.actor.userId);
    this.enforce(
      decideCardRead(
        args.actor,
        {
          status: row.status,
          isPremium: row.isPremium,
          createdBy: row.createdBy,
          deckIsPremium: row.deckIsPremium,
        },
        entitled,
      ),
      "carte introuvable",
    );
    const [inserted] = await this.db
      .insert(cardReports)
      .values({
        cardId: args.cardId,
        userId: args.actor.userId,
        reason: args.reason,
        comment: args.comment,
      })
      .returning({ id: cardReports.id });
    return { id: inserted!.id };
  }

  /// GET /content/reports
  async listReports() {
    const rows = await this.db
      .select()
      .from(cardReports)
      .orderBy(desc(cardReports.createdAt));
    return {
      items: rows.map((r) => ({
        id: r.id,
        card_id: r.cardId,
        user_id: r.userId,
        reason: r.reason,
        comment: r.comment,
        status: r.status,
        reported_at: r.createdAt.toISOString(),
      })),
    };
  }

  /// PATCH /content/reports/:id
  async updateReport(args: { id: string; status: string; comment?: string }) {
    const existing = await this.db
      .select({ id: cardReports.id })
      .from(cardReports)
      .where(eq(cardReports.id, args.id))
      .then((rows) => rows[0]);
    if (!existing) throw new NotFoundException("signalement introuvable");
    await this.db
      .update(cardReports)
      .set({ status: args.status })
      .where(eq(cardReports.id, args.id));
    return { id: args.id, status: args.status };
  }

  /// POST /content/media/presign — SigV4 si R2_* est posé, sinon 501.
  /// Jamais d'URL publique fictive.
  async presignMedia(args: {
    userId: string;
    filename: string;
    content_type: string;
    size_bytes: number;
  }) {
    if (!this.media.provisioned) {
      throw new HttpException(
        "stockage média non provisionné",
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    try {
      return this.media.presign({
        userId: args.userId,
        filename: args.filename,
        contentType: args.content_type,
        sizeBytes: args.size_bytes,
      });
    } catch (err) {
      if (err instanceof MediaStorageError) {
        if (err.code === "not_provisioned") {
          throw new HttpException(err.message, HttpStatus.NOT_IMPLEMENTED);
        }
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private async isEntitled(userId: string): Promise<boolean> {
    const state = await this.billing.currentEntitlement(userId);
    return state.isActive;
  }

  private enforce(decision: AccessDecision, hiddenMessage: string): void {
    if (decision === "allow") return;
    if (decision === "not_found") throw new NotFoundException(hiddenMessage);
    throw new ForbiddenException("entitlement premium requis");
  }

  private async loadCardWithDeck(cardId: string) {
    const row = await this.db
      .select({
        id: cards.id,
        deckId: cards.deckId,
        type: cards.type,
        status: cards.status,
        version: cards.version,
        isPremium: cards.isPremium,
        createdBy: cards.createdBy,
        publishedAt: cards.publishedAt,
        updatedAt: cards.updatedAt,
        content: cards.content,
        sourceMeta: cards.sourceMeta,
        tags: cards.tags,
        deckIsPremium: decks.isPremium,
      })
      .from(cards)
      .innerJoin(decks, eq(decks.id, cards.deckId))
      .where(eq(cards.id, cardId))
      .then((rows) => rows[0]);
    return row ?? null;
  }

  private _extractTitle(content: unknown): string {
    if (!content || typeof content !== "object") return "—";
    const fr = (content as { front_fr?: unknown }).front_fr ?? "";
    if (typeof fr === "string") {
      return fr.replace(/<[^>]+>/g, "").slice(0, 60);
    }
    return "—";
  }
}
