// DTO — partenariats (Phase 20.4).
import { z } from 'zod';
import { FACULTIES_DZ } from './faculties';

/// Faculty : allow-list (recoupée avec le contenu par
/// check_partnerships.py). Comparaison exacte — la casse suit
/// faculties.ts.
export const PartnershipCreateBody = z
  .object({
    faculty: z
      .string()
      .min(1)
      .max(120)
      .refine((f) => (FACULTIES_DZ as readonly string[]).includes(f), {
        message: 'faculté inconnue (allow-list)',
      }),
    contact_email: z.string().email().max(200),
    scope: z.array(z.string().min(1).max(120)).max(50).default([]),
    commission_pct: z.number().int().min(0).max(50).default(0),
    signed_at: z.string().datetime().optional(),
  })
  .strict();
export type PartnershipCreateBody = z.infer<typeof PartnershipCreateBody>;

export const PartnershipStatusBody = z
  .object({
    status: z.enum(['active', 'suspended', 'terminated']),
  })
  .strict();
export type PartnershipStatusBody = z.infer<typeof PartnershipStatusBody>;
