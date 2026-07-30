/// Service Content — GET decks, delta de cartes, signalements.
///
/// Toutes les requêtes sont scopées par utilisateur. Les decks premium
/// sont filtrés selon l'entitlement (Phase 7 câblera la vérification).
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { cards, cardReports, decks, modules, programmes } from '../db/schema';
import { DRIZZLE, Database } from '../db/database.module';

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

  /// GET /content/decks/:id/cards?version_since=  — delta de cartes.
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
      .get();
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
}
