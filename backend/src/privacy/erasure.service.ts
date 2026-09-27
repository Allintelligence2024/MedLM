/// Effacement RGPD compatible append-only (R05).
///
/// On ne DELETE jamais `users` s'il existe des `review_logs` : le FK est
/// RESTRICT et le trigger refuse DELETE sur le journal. L'identité est
/// anonymisée ; les séances / jetons / MFA partent ; le journal SRS et
/// les ordres de paiement restent sous un id opaque.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../db/database.module';
import {
  adminMfa,
  adminMfaBackupCodes,
  authChallenges,
  cardReports,
  refreshTokens,
  studySessions,
  syncCursors,
  userDevices,
  users,
  entitlements,
} from '../db/schema';

export function erasedEmailFor(userId: string): string {
  return `erased-${userId}@invalid.invalid`;
}

@Injectable()
export class ErasureService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async eraseUser(userId: string): Promise<{ erased: true; userId: string }> {
    await this.db.transaction(async (tx) => {
      const user = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .then((rows) => rows[0]);
      if (!user) throw new NotFoundException('utilisateur introuvable');

      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await tx.delete(userDevices).where(eq(userDevices.userId, userId));
      await tx.delete(adminMfaBackupCodes).where(eq(adminMfaBackupCodes.userId, userId));
      await tx.delete(adminMfa).where(eq(adminMfa.userId, userId));
      await tx.delete(authChallenges).where(eq(authChallenges.email, user.email));
      await tx.delete(syncCursors).where(eq(syncCursors.userId, userId));
      await tx.delete(studySessions).where(eq(studySessions.userId, userId));
      await tx.delete(cardReports).where(eq(cardReports.userId, userId));
      await tx.delete(entitlements).where(eq(entitlements.userId, userId));

      await tx
        .update(users)
        .set({
          email: erasedEmailFor(userId),
          phone: sql`NULL`,
          displayName: sql`NULL`,
          faculty: sql`NULL`,
          lastSeenAt: sql`NULL`,
        })
        .where(eq(users.id, userId));
    });
    return { erased: true, userId };
  }
}
