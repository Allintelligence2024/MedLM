// DTO — endpoints adaptatifs (Phase 18.4).
import { z } from 'zod';

/// GET /v1/ai/adaptive/signals?status=open&limit=50
/// (query string : les nombres arrivent en texte → z.coerce)
export const SignalsListQuery = z
  .object({
    status: z.enum(['open', 'resolved', 'ignored']).default('open'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type SignalsListQuery = z.infer<typeof SignalsListQuery>;

/// POST /v1/ai/adaptive/signals/scan — balayage global (rôle editor+).
export const SignalsScanBody = z
  .object({
    min_lapses_per_user: z.number().int().min(2).max(10).default(3),
    min_affected_users: z.number().int().min(2).max(100).default(5),
    window_days: z.number().int().min(7).max(180).default(30),
  })
  .strict();
export type SignalsScanBody = z.infer<typeof SignalsScanBody>;
