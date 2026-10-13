// A quote is not consumption. Billing holds this row lock through order insertion.
import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { promoCodes, paymentOrders } from '../db/schema';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
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
  async resolve(
    args: { code: string; plan: string; baseCents: number },
    tx?: Transaction,
  ): Promise<PromoResolution> {
    if (!tx) return this.db.transaction((inner) => this.resolve(args, inner));
    const code = args.code.trim().toUpperCase();
    const [row] = await tx
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, code))
      .for('update');
    if (!row || (row.expiresAt && row.expiresAt.getTime() <= Date.now()))
      throw new NotFoundException('code promo inconnu ou expiré');
    const [reserved] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.promoCode, code),
          eq(paymentOrders.status, 'pending'),
        ),
      );
    if (row.usedCount + (reserved?.count ?? 0) >= row.maxUses)
      throw new NotFoundException('code promo épuisé ou réservé');
    if (row.discountPct < 0 || row.discountPct >= 100)
      throw new BadRequestException('réduction payante invalide');
    // Chargily amounts are whole dinars; the persisted quote uses this rounding.
    const finalCents =
      Math.round((args.baseCents / 100) * (1 - row.discountPct / 100)) * 100;
    return {
      baseCents: args.baseCents,
      discountPct: row.discountPct,
      finalCents,
      code,
      durationDays: row.planDurationDays,
    };
  }
}
