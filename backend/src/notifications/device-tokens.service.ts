/// DeviceTokensService — registre des appareils joignables (audit P1-3).
///
/// Règles :
///   * un enregistrement par (utilisateur, appareil) — la ré-émission
///     d'un jeton par FCM est un UPDATE, pas une ligne de plus ;
///   * un même jeton ne peut pas rester rattaché à deux comptes : sur
///     un appareil partagé, le dernier connecté gagne et les anciens
///     rattachements sont désactivés (sinon l'ancien utilisateur
///     recevrait les notifications du nouveau) ;
///   * on désactive, on ne supprime pas : garder la trace permet de ne
///     pas retenter indéfiniment un appareil désinstallé.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { deviceTokens } from '../db/schema/notifications';
import type {
  DeviceTokenView,
  RegisterDeviceTokenBody,
} from './device-tokens.dto';

@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger(DeviceTokensService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// Enregistre ou met à jour le jeton d'un appareil.
  async register(args: {
    userId: string;
    deviceId: string;
    body: RegisterDeviceTokenBody;
  }): Promise<DeviceTokenView> {
    const { userId, deviceId, body } = args;

    // Le même jeton ailleurs = appareil réattribué à un autre compte.
    await this.db
      .update(deviceTokens)
      .set({
        disabledAt: new Date(),
        disabledReason: 'reassigned',
        updatedAt: new Date(),
      })
      .where(and(eq(deviceTokens.token, body.token), ne(deviceTokens.userId, userId)));

    const now = new Date();
    const [row] = await this.db
      .insert(deviceTokens)
      .values({
        userId,
        deviceId,
        token: body.token,
        platform: body.platform,
        appVersion: body.app_version ?? null,
        locale: body.locale ?? null,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [deviceTokens.userId, deviceTokens.deviceId],
        set: {
          token: body.token,
          platform: body.platform,
          appVersion: body.app_version ?? null,
          locale: body.locale ?? null,
          // Une ré-inscription réactive un appareil précédemment
          // marqué injoignable (réinstallation de l'app).
          disabledAt: null,
          disabledReason: null,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning();

    return toView(row!);
  }

  /// Désactive l'appareil courant (déconnexion, retrait du consentement).
  async unregister(args: { userId: string; deviceId: string }): Promise<{ disabled: number }> {
    const res = await this.db
      .update(deviceTokens)
      .set({
        disabledAt: new Date(),
        disabledReason: 'unregistered',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deviceTokens.userId, args.userId),
          eq(deviceTokens.deviceId, args.deviceId),
          isNull(deviceTokens.disabledAt),
        ),
      )
      .returning({ id: deviceTokens.id });
    return { disabled: res.length };
  }

  /// Appareils joignables d'un utilisateur — c'est ce que consomme
  /// l'envoi de notifications.
  async activeFor(userId: string): Promise<DeviceTokenView[]> {
    const rows = await this.db
      .select()
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), isNull(deviceTokens.disabledAt)));
    return rows.map(toView);
  }

  /// Jetons bruts + plateforme, pour l'orchestrateur d'envoi.
  async targetsFor(
    userId: string,
  ): Promise<{ token: string; platform: 'android' | 'ios' | 'web'; locale: string | null }[]> {
    const rows = await this.db
      .select({
        token: deviceTokens.token,
        platform: deviceTokens.platform,
        locale: deviceTokens.locale,
      })
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), isNull(deviceTokens.disabledAt)));
    return rows.map((r) => ({
      token: r.token,
      platform: r.platform as 'android' | 'ios' | 'web',
      locale: r.locale,
    }));
  }

  /// Marque un jeton injoignable — appelé quand le provider répond
  /// UNREGISTERED (404/410). Sans ça, on retenterait éternellement.
  async markUnreachable(token: string, reason: string): Promise<void> {
    await this.db
      .update(deviceTokens)
      .set({
        disabledAt: new Date(),
        disabledReason: reason.slice(0, 64),
        updatedAt: new Date(),
      })
      .where(and(eq(deviceTokens.token, token), isNull(deviceTokens.disabledAt)));
    this.logger.debug(`jeton désactivé (${reason})`);
  }

  /// Purge des appareils désactivés depuis longtemps (RGPD : on ne
  /// conserve pas d'identifiant d'appareil au-delà de l'utile).
  async purgeDisabledOlderThan(days: number): Promise<number> {
    const res = await this.db
      .delete(deviceTokens)
      .where(
        and(
          sql`${deviceTokens.disabledAt} IS NOT NULL`,
          sql`${deviceTokens.disabledAt} < now() - make_interval(days => ${days})`,
        ),
      )
      .returning({ id: deviceTokens.id });
    return res.length;
  }
}

function toView(row: typeof deviceTokens.$inferSelect): DeviceTokenView {
  return {
    device_id: row.deviceId,
    platform: row.platform as 'android' | 'ios' | 'web',
    app_version: row.appVersion,
    locale: row.locale,
    disabled: row.disabledAt !== null,
    last_seen_at: row.lastSeenAt.toISOString(),
  };
}
