// PromoCodeProvider — applies promotional codes to a base plan price.
//
// Codes live in the `promo_codes` table (already in schema/users.ts).
// On use, we bump `used_count` atomically and return the discounted amount.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { promoCodes } from '../db/schema';

export interface PromoResolution {
  baseCents: number;
  discountPct: number;
  finalCents: number;
  code: string;
  durationDays: number;
}

@Injectable()
export class PromoCodeProvider {

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async resolve(args: { code: string; plan: string; baseCents: number }): Promise<PromoResolution> {
    const code = args.code.trim().toUpperCase();
    return this.db.transaction(async (tx) => {
      const row = await tx
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, code))
        .then((rows) => rows[0]);
      if (!row) throw new NotFoundException('code promo inconnu');
      if (row.expiresAt && row.expiresAt < new Date()) {
        throw new NotFoundException('code promo expiré');
      }
      if (row.usedCount >= row.maxUses) {
        throw new NotFoundException('code promo épuisé');
      }
      // Atomic increment; if two requests race, one will fail the WHERE.
      const updated = await tx
        .update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(sql`${promoCodes.code} = ${code} AND ${promoCodes.usedCount} < ${promoCodes.maxUses}`)
        .returning();
      if (updated.length === 0) {
        throw new NotFoundException('code promo épuisé (race)');
      }
      const finalCents = Math.round(args.baseCents * (1 - row.discountPct / 100));
      return {
        baseCents: args.baseCents,
        discountPct: row.discountPct,
        finalCents,
        code,
        durationDays: row.planDurationDays,
      };
    });
  }
}
