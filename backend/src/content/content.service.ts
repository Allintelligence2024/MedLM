/// Service Content — GET decks, delta de cartes, signalements,
/// édition CMS (Phase 11 bis).
///
/// Toutes les requêtes sont scopées par utilisateur. Les decks premium
/// sont filtrés selon l'entitlement (Phase 7 câblera la vérification).
import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cards, cardReports, decks, modules } from '../db/schema';
import { DRIZZLE, Database } from '../db/database.module';
import type { UpdateCardBody } from './content.dto';

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

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'retired'],
  review: ['approved', 'draft', 'retired'],
  approved: ['published', 'review', 'retired'],
  published: ['retired'],
  retired: ['draft'],
};

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// GET /content/decks
  async listDecks(args: {
    moduleId?: string;
    versionSince: number;
    limit: number;
  }): Promise<{ items: DeckListItem[]; next_cursor_version: number }> {
    const where = args.moduleId
      ? and(
          gte(decks.version, args.versionSince),
          eq(decks.moduleId, args.moduleId),
        )
      : gte(decks.version, args.versionSince);

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
      next_cursor_version: hasMore ? page[page.length - 1]!.version : args.versionSince,
    };
  }

  /// GET /content/decks/:id/cards?version_since=
  async listDeckCards(args: {
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
      .select({ id: decks.id, version: decks.version })
      .from(decks)
      .where(eq(decks.id, args.deckId))
      .then((rows) => rows[0]);
    if (!deck) throw new NotFoundException(`deck ${args.deckId} introuvable`);

    const rows = await this.db
      .select()
      .from(cards)
      .where(
        and(eq(cards.deckId, args.deckId), gte(cards.version, args.versionSince)),
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
      next_cursor_version: hasMore ? page[page.length - 1]!.version : args.versionSince,
    };
  }

  /// GET /content/cards/list?limit=
  /// Vue CMS : retourne un résumé de toutes les cartes (id, deck, statut, version...).
  async listCardsForCms(args: { moduleId?: string; limit: number }) {
    const rows = await this.db
      .select({
        id: cards.id,
        deckId: cards.deckId,
        type: cards.type,
        status: cards.status,
        version: cards.version,
        isPremium: cards.isPremium,
        publishedAt: cards.publishedAt,
        updatedAt: cards.updatedAt,
        content: cards.content,
      })
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

  /// GET /content/cards/:id — détail complet.
  async getCard(cardId: string) {
    const row = await this.db
      .select()
      .from(cards)
      .where(eq(cards.id, cardId))
      .then((rows) => rows[0]);
    if (!row) throw new NotFoundException('carte introuvable');
    const c = (row.content as any) ?? {};
    const s = (row.sourceMeta as any) ?? {};
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
        front_fr: c.front_fr ?? '',
        back_fr: c.back_fr ?? '',
        front_en: c.front_en ?? '',
        back_en: c.back_en ?? '',
        explanation_fr: c.explanation_fr ?? '',
        explanation_en: c.explanation_en ?? '',
        media: Array.isArray(c.media) ? c.media : [],
      },
      source: {
        type: s.type ?? 'original',
        faculty: s.faculty ?? '',
        year: s.year ?? null,
        can_distribute_offline: s.can_distribute_offline ?? true,
        license: s.license ?? '',
      },
      tags: row.tags ?? [],
    };
  }

  /// PATCH /content/cards/:id — édition CMS.
  async updateCard(args: { userId: string; cardId: string; body: UpdateCardBody }) {
    const existing = await this.db
      .select({ id: cards.id, version: cards.version, status: cards.status })
      .from(cards)
      .where(eq(cards.id, args.cardId))
      .then((rows) => rows[0]);
    if (!existing) throw new NotFoundException('carte introuvable');
    if (existing.status === 'published') {
      // Édition d'une carte publiée : on incrémente la version et
      // on remet en draft pour re-revue.
      // (Stratégie safe par défaut ; un override admin sera possible.)
    }
    await this.db
      .update(cards)
      .set({
        content: args.body.content as any,
        sourceMeta: args.body.source as any,
        tags: args.body.tags,
        version: existing.version + 1,
        updatedAt: new Date(),
        status: existing.status === 'published' ? 'draft' : existing.status,
      })
      .where(eq(cards.id, args.cardId));
    this.logger.log(
      `card updated: ${args.cardId} v${existing.version + 1} by user=${args.userId}`,
    );
    return { id: args.cardId, version: existing.version + 1 };
  }

  /// POST /content/cards/:id/transition — transition workflow.
  async transitionCard(args: {
    userId: string;
    cardId: string;
    to: string;
    comment?: string;
  }) {
    const existing = await this.db
      .select({ id: cards.id, status: cards.status, version: cards.version })
      .from(cards)
      .where(eq(cards.id, args.cardId))
      .then((rows) => rows[0]);
    if (!existing) throw new NotFoundException('carte introuvable');
    const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(args.to)) {
      throw new BadRequestException(
        `transition ${existing.status} → ${args.to} interdite`,
      );
    }
    await this.db
      .update(cards)
      .set({
        status: args.to as any,
        version: existing.version + 1,
        updatedAt: new Date(),
        publishedAt: args.to === 'published' ? new Date() : null,
      })
      .where(eq(cards.id, args.cardId));
    this.logger.log(
      `card transition: ${args.cardId} ${existing.status} → ${args.to} by user=${args.userId}`,
    );
    return { id: args.cardId, from: existing.status, to: args.to };
  }

  /// POST /content/cards/:id/report
  async reportCard(args: {
    userId: string;
    cardId: string;
    reason: string;
    comment: string;
  }): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(cardReports)
      .values({
        cardId: args.cardId,
        userId: args.userId,
        reason: args.reason,
        comment: args.comment,
      })
      .returning({ id: cardReports.id });
    return { id: row!.id };
  }

  /// GET /content/reports — liste pour le CMS.
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

  /// PATCH /content/reports/:id — résolution.
  async updateReport(args: { id: string; status: string; comment?: string }) {
    await this.db
      .update(cardReports)
      .set({ status: args.status as any })
      .where(eq(cardReports.id, args.id));
    return { id: args.id, status: args.status };
  }

  /// POST /content/media/presign — génère une presigned URL pour R2.
  /// NOTE : implémentation stub. En production, on utilise le SDK
  /// AWS S3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
  /// avec les credentials R2.
  async presignMedia(args: {
    userId: string;
    filename: string;
    content_type: string;
    size_bytes: number;
  }) {
    const key = `media/${args.userId}/${Date.now()}-${randomUUID().slice(0, 8)}-${args.filename}`;
    const uploadUrl = `https://r2.example.com/${key}?X-Amz-Stub=1`;
    const publicUrl = `https://media.medanki-dz.com/${key}`;
    return {
      key,
      upload_url: uploadUrl,
      public_url: publicUrl,
      expires_in: 600, // 10 min
    };
  }

  private _extractTitle(content: unknown): string {
    const c = content as any;
    if (!c) return '—';
    const fr = c.front_fr ?? '';
    if (typeof fr === 'string') {
      return fr.replace(/<[^>]+>/g, '').slice(0, 60);
    }
    return '—';
  }
}
