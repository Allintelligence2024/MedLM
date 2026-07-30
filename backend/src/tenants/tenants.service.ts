// TenantsService — Phase 16.4 — B2B multi-tenancy.
//
// Responsabilités :
//   * Créer un tenant (admin uniquement).
//   * Lister les tenants d'un user.
//   * Ajouter/retirer un user d'un tenant avec un rôle.
//   * Récupérer le branding pour le CMS / le mobile.
//
// Notes de design :
//   * Un user peut être lié à plusieurs tenants (cas réel : un
//     prof enseigne dans 2 facultés).
//   * Les ressources (decks) restent globales pour la v1. Le
//     scoping par tenant viendra en Phase 18+ (migration plus
//     invasive : ajout de tenant_id nullable sur les tables).
//   * Le branding est exposé publiquement (lecture seule via GET
//     /v1/tenants/:slug/branding) pour que le mobile puisse
//     adapter ses couleurs sans authentification.
import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { tenants, userTenants } from '../db/schema/tenants';
import { CreateTenantBody, TenantView } from './tenants.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(args: { body: CreateTenantBody }): Promise<TenantView> {
    // Vérifier que le slug n'existe pas déjà.
    const existing = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, args.body.slug))
      .get();
    if (existing) {
      throw new BadRequestException(`slug déjà pris : ${args.body.slug}`);
    }
    const inserted = await this.db
      .insert(tenants)
      .values({
        slug: args.body.slug,
        name: args.body.name,
        country: args.body.country,
        city: args.body.city ?? null,
        plan: args.body.plan,
        branding: (args.body.branding as any) ?? {},
        ssoConfig: {},
        isActive: true,
      })
      .returning({ id: tenants.id });
    this.logger.log(`tenant créé: slug=${args.body.slug} plan=${args.body.plan}`);
    return this._view(inserted[0]!.id);
  }

  async listForUser(args: { userId: string }): Promise<TenantView[]> {
    const rows = await this.db
      .select({ tenantId: userTenants.tenantId })
      .from(userTenants)
      .where(eq(userTenants.userId, args.userId));
    const views: TenantView[] = [];
    for (const r of rows) {
      views.push(await this._view(r.tenantId));
    }
    return views;
  }

  async addUser(args: { tenantId: string; userId: string; role: 'student' | 'instructor' | 'admin' }): Promise<{ ok: true }> {
    try {
      await this.db.insert(userTenants).values({
        tenantId: args.tenantId,
        userId: args.userId,
        role: args.role,
      });
    } catch (e) {
      if ((e as Error).message?.includes('UNIQUE') || (e as Error).message?.includes('unique')) {
        // Idempotent : si déjà lié, on met à jour le rôle.
        await this.db
          .update(userTenants)
          .set({ role: args.role })
          .where(
            and(
              eq(userTenants.tenantId, args.tenantId),
              eq(userTenants.userId, args.userId),
            ),
          );
        return { ok: true };
      }
      throw e;
    }
    this.logger.log(`user ajouté au tenant: tenantId=${args.tenantId} userId=${args.userId} role=${args.role}`);
    return { ok: true };
  }

  async removeUser(args: { tenantId: string; userId: string }): Promise<{ ok: true }> {
    await this.db
      .delete(userTenants)
      .where(
        and(
          eq(userTenants.tenantId, args.tenantId),
          eq(userTenants.userId, args.userId),
        ),
      );
    this.logger.log(`user retiré du tenant: tenantId=${args.tenantId} userId=${args.userId}`);
    return { ok: true };
  }

  /// Vue publique (lecture seule) pour le branding — appelée
  /// sans auth par le mobile pour adapter ses couleurs.
  async getBrandingBySlug(slug: string): Promise<{ slug: string; branding: Record<string, unknown>; name: string } | null> {
    const row = await this.db
      .select({ slug: tenants.slug, name: tenants.name, branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .get();
    if (!row) return null;
    return {
      slug: row.slug,
      name: row.name,
      branding: row.branding as Record<string, unknown>,
    };
  }

  /// Vue admin : toutes les infos d'un tenant.
  async get(tenantId: string): Promise<TenantView> {
    return this._view(tenantId);
  }

  private async _view(tenantId: string): Promise<TenantView> {
    const row = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .get();
    if (!row) throw new NotFoundException('tenant introuvable');
    const countRow = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(userTenants)
      .where(eq(userTenants.tenantId, tenantId))
      .get();
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      country: row.country,
      city: row.city,
      plan: row.plan,
      is_active: row.isActive,
      contract_ends_at: row.contractEndsAt?.toISOString() ?? null,
      branding: row.branding as Record<string, unknown>,
      user_count: countRow?.c ?? 0,
      created_at: row.createdAt.toISOString(),
    };
  }
}
