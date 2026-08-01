// GroupPacksService — Phase 16.3.
//
// v2 §8.2 — "Pack groupe : 5 étudiants -30%".
//
// Flux :
//   1. Le coordinateur crée un pack → invite_code généré.
//   2. Les 4 invités rejoignent via invite_code.
//   3. Quand le pack est plein (5 membres), on calcule le
//      prix réduit et on crée un checkout Chargily.
//   4. Le coordinateur paie → tous les entitlements sont activés.
//   5. Si le pack expire (24h) sans être plein, on le marque
//      'expired' et on notifie le coordinateur (Phase 14+).
import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { groupPacks, groupPackMembers } from '../db/schema/group-packs';
import { users } from '../db/schema/users';
import { PLAN_PRICING_DA, PlanId } from '../billing/billing.dto';
import { CreatePackBody, GroupPackView, JoinPackBody } from './group-packs.dto';

const PACK_SIZE = 5;
const DISCOUNT_PCT = 30;
const TTL_HOURS = 24;
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars (sans 0/O/1/I/L)

@Injectable()
export class GroupPacksService {
  private readonly logger = new Logger(GroupPacksService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// Crée un pack et y ajoute le coordinateur comme 1er membre.
  async create(args: { userId: string; body: CreatePackBody }): Promise<GroupPackView> {
    const baseCents = PLAN_PRICING_DA[args.body.plan] * 100;
    const perUserCents = Math.round(baseCents * (1 - DISCOUNT_PCT / 100));
    const inviteCode = this._generateInviteCode();

    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
    const inserted = await this.db
      .insert(groupPacks)
      .values({
        coordinatorUserId: args.userId,
        plan: args.body.plan,
        faculty: args.body.faculty ?? null,
        inviteCode,
        status: 'pending',
        perUserCents,
        expiresAt,
      })
      .returning({ id: groupPacks.id });
    const packId = inserted[0]!.id;

    // Ajoute le coordinateur comme membre.
    await this.db.insert(groupPackMembers).values({
      packId,
      userId: args.userId,
      isCoordinator: 'true',
    });

    this.logger.log(
      `pack créé: id=${packId} coordinateur=${args.userId} plan=${args.body.plan} code=${inviteCode}`,
    );
    return this._view(packId);
  }

  /// Rejoint un pack existant via son code d'invitation.
  async join(args: { userId: string; body: JoinPackBody }): Promise<GroupPackView> {
    const code = args.body.invite_code.toUpperCase();
    return this.db.transaction(async (tx) => {
      const pack = await tx
        .select()
        .from(groupPacks)
        .where(eq(groupPacks.inviteCode, code))
        .then((rows) => rows[0]);
      if (!pack) throw new NotFoundException('code d\'invitation inconnu');
      if (pack.status !== 'pending') {
        throw new BadRequestException(`pack ${pack.status}`);
      }
      if (pack.expiresAt.getTime() < Date.now()) {
        await tx.update(groupPacks).set({ status: 'expired' }).where(eq(groupPacks.id, pack.id));
        throw new BadRequestException('pack expiré');
      }
      const memberCount = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(groupPackMembers)
        .where(eq(groupPackMembers.packId, pack.id))
        .then((rows) => rows[0]);
      if ((memberCount?.c ?? 0) >= PACK_SIZE) {
        throw new BadRequestException('pack complet');
      }
      // Insert (ou catch si déjà membre).
      try {
        await tx.insert(groupPackMembers).values({
          packId: pack.id,
          userId: args.userId,
          isCoordinator: 'false',
        });
      } catch (e) {
        if ((e as Error).message?.includes('UNIQUE') || (e as Error).message?.includes('unique')) {
          throw new BadRequestException('déjà membre de ce pack');
        }
        throw e;
      }
      // Si on atteint 5 membres, on passe le pack en 'full'
      // (mais on ne crée le checkout qu'à l'appel /pay).
      const newCount = (memberCount?.c ?? 0) + 1;
      if (newCount >= PACK_SIZE) {
        await tx
          .update(groupPacks)
          .set({ status: 'full' })
          .where(eq(groupPacks.id, pack.id));
      }
      this.logger.log(
        `pack rejoint: id=${pack.id} nouveau=${args.userId} count=${newCount}/${PACK_SIZE}`,
      );
      return this._view(pack.id);
    });
  }

  /// Lit l'état d'un pack (par son id ou son invite_code).
  async get(args: { packId?: string; inviteCode?: string; userId: string }): Promise<GroupPackView> {
    let packId = args.packId;
    if (!packId && args.inviteCode) {
      const p = await this.db
        .select({ id: groupPacks.id })
        .from(groupPacks)
        .where(eq(groupPacks.inviteCode, args.inviteCode))
        .then((rows) => rows[0]);
      if (!p) throw new NotFoundException('pack introuvable');
      packId = p.id;
    }
    if (!packId) throw new BadRequestException('packId ou inviteCode requis');
    return this._view(packId);
  }

  /// Calcule le prix par user + l'économie totale.
  _computeSavings(plan: PlanId): { perUserCents: number; savingsCents: number } {
    const baseCents = PLAN_PRICING_DA[plan] * 100;
    const perUserCents = Math.round(baseCents * (1 - DISCOUNT_PCT / 100));
    const savingsCents = (baseCents - perUserCents) * PACK_SIZE;
    return { perUserCents, savingsCents };
  }

  _generateInviteCode(): string {
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += INVITE_CODE_ALPHABET[bytes[i]! % INVITE_CODE_ALPHABET.length];
    }
    return code;
  }

  /// Construit la vue publique d'un pack.
  private async _view(packId: string): Promise<GroupPackView> {
    const pack = await this.db
      .select()
      .from(groupPacks)
      .where(eq(groupPacks.id, packId))
      .then((rows) => rows[0]);
    if (!pack) throw new NotFoundException('pack introuvable');
    const members = await this.db
      .select({
        userId: groupPackMembers.userId,
        isCoordinator: groupPackMembers.isCoordinator,
        joinedAt: groupPackMembers.joinedAt,
        email: users.email,
      })
      .from(groupPackMembers)
      .innerJoin(users, eq(users.id, groupPackMembers.userId))
      .where(eq(groupPackMembers.packId, packId));
    const baseCents = PLAN_PRICING_DA[pack.plan as PlanId] * 100;
    const savingsCents = (baseCents - pack.perUserCents) * PACK_SIZE;
    return {
      id: pack.id,
      plan: pack.plan,
      faculty: pack.faculty,
      coordinator_user_id: pack.coordinatorUserId,
      invite_code: pack.inviteCode,
      status: pack.status as GroupPackView['status'],
      member_count: members.length,
      members: members.map((m) => ({
        user_id: m.userId,
        email: m.email,
        is_coordinator: m.isCoordinator === 'true',
        joined_at: m.joinedAt.toISOString(),
      })),
      per_user_cents: pack.perUserCents,
      total_savings_cents: savingsCents,
      expires_at: pack.expiresAt.toISOString(),
      payment_url: null, // à brancher Phase 16+ avec Chargily
      created_at: pack.createdAt.toISOString(),
    };
  }
}
