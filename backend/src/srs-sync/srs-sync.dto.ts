/// DTOs Zod pour le protocole de synchronisation SRS.
///
/// Ce contrat est **figé** : tout changement de format est un breaking
/// change pour les clients mobiles déployés. L'ajout de champs optionnels
/// est OK, la suppression ou le renommage ne l'est pas.
///
/// Côté Dart, l'équivalent strict vit dans
/// `mobile/lib/core/srs/review_event.dart` (`toJson` / `fromJson`).
import { z } from 'zod';
import { CardType, Rating } from '../common/fsrs/fsrs.constants';

/// UUID v7, ou n'importe quel UUID en pratique (on n'est pas stricts côté
/// parsing — la validation a déjà eu lieu à l'émission, côté mobile).
const uuid = z.string().uuid();

const rating = z.nativeEnum(Rating);
const cardType = z.nativeEnum(CardType);

/// Un événement du journal.
export const ReviewEventDto = z.object({
  id: uuid,
  card_id: uuid,
  user_id: uuid,
  device_id: z.string().min(1).max(128),
  rating,
  duration_ms: z.number().int().nonnegative().default(0),
  card_type: cardType.default(CardType.Basic),
  reviewed_at: z.number().int().nonnegative(),
  exam_mode: z.boolean().default(false),
});
export type ReviewEventDto = z.infer<typeof ReviewEventDto>;

/// Corps de POST /srs-sync/push : batch de 100 événements max.
export const PushBody = z.object({
  events: z.array(ReviewEventDto).min(1).max(100),
});
export type PushBody = z.infer<typeof PushBody>;

/// Réponse de /srs-sync/push.
export interface PushResponse {
  accepted: string[];
  rejected: { id: string; reason: string }[];
  server_time_ms: number;
}

/// Réponse de /srs-sync/pull.
export interface PullResponse {
  events: ReviewEventDto[];
  next_cursor_ms: number;
  has_more: boolean;
}

/// Query de /srs-sync/pull.
export const PullQuery = z.object({
  since_ms: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type PullQuery = z.infer<typeof PullQuery>;
