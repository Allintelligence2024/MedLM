// PartnershipsService — Phase 20.4 (orchestration DB ; les règles
// d'état sont dans partnership-status.ts, pures).
import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { partnerships } from '../db/schema/partnerships';
import {
  assertActivable,
  assertTransition,
  PartnershipStatus,
} from './partnership-status';
import { PartnershipCreateBody } from './partnerships.dto';

@Injectable()
export class PartnershipsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(status?: string) {
    const query = status
      ? this.db
          .select()
          .from(partnerships)
          .where(eq(partnerships.status, status))
          .orderBy(desc(partnerships.createdAt))
      : this.db.select().from(partnerships).orderBy(desc(partnerships.createdAt));
    const rows = await query;
    return { items: rows };
  }

  async create(body: PartnershipCreateBody) {
    const [row] = await this.db
      .insert(partnerships)
      .values({
        faculty: body.faculty,
        contactEmail: body.contact_email,
        scope: body.scope,
        commissionPct: body.commission_pct,
        signedAt: body.signed_at ? new Date(body.signed_at) : null,
        status: 'draft',
      })
      .returning();
    return row;
  }

  /// Transition d'état (machine pure + contrainte unique active).
  async transition(id: string, to: PartnershipStatus) {
    const [current] = await this.db
      .select()
      .from(partnerships)
      .where(eq(partnerships.id, id))
      .limit(1);
    if (!current) throw new NotFoundException('partenariat introuvable');

    try {
      if (to === 'active') {
        assertActivable({
          from: current.status as PartnershipStatus,
          signedAt: current.signedAt,
          commissionPct: current.commissionPct,
        });
      } else {
        assertTransition(
          current.status as PartnershipStatus,
          to,
        );
      }
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Un seul ACTIVE par faculté : l'index partiel UNIQUE lève une
    // erreur si une autre ligne active existe — on la traduit proprement.
    try {
      const [updated] = await this.db
        .update(partnerships)
        .set({ status: to, updatedAt: new Date() })
        .where(eq(partnerships.id, id))
        .returning();
      return updated;
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('partnerships_active_faculty_idx')) {
        throw new BadRequestException(
          `la faculté ${current.faculty} a déjà un partenariat actif`,
        );
      }
      throw e;
    }
  }
}
