// DTOs Tenants (Phase 16.4 — B2B multi-tenancy).
import { z } from 'zod';

/// Body : crée un nouveau tenant (admin uniquement).
export const CreateTenantBody = z.object({
  /// Slug URL-safe (3..40 chars, a-z, 0-9, tirets).
  slug: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/, 'slug doit être a-z, 0-9, tirets'),
  name: z.string().min(2).max(200),
  country: z.string().length(2).default('DZ'),
  city: z.string().max(100).optional(),
  /// Plan B2B : starter, growth, enterprise.
  plan: z.enum(['starter', 'growth', 'enterprise']).default('starter'),
  /// Branding initial.
  branding: z
    .object({
      logo_url: z.string().url().optional(),
      primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .optional(),
});
export type CreateTenantBody = z.infer<typeof CreateTenantBody>;

/// Body : lie un user à un tenant avec un rôle.
export const AddUserBody = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['student', 'instructor', 'admin']).default('student'),
});
export type AddUserBody = z.infer<typeof AddUserBody>;

/// Vue publique d'un tenant.
export interface TenantView {
  id: string;
  slug: string;
  name: string;
  country: string;
  city: string | null;
  plan: string;
  is_active: boolean;
  contract_ends_at: string | null;
  branding: Record<string, unknown>;
  user_count?: number;
  created_at: string;
}
