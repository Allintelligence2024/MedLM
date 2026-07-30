// NotificationsService — orchestrateur FCM + APNs (Phase 14).
//
// Trois types de notifs (v2 §11.3) :
//   * due_reminder  : "Vous avez N cartes dues aujourd'hui"
//   * streak_danger : "Votre streak est en danger, révisez !"
//   * deck_updated  : "Le deck X a été mis à jour"
//
// Routing par plateforme :
//   * platform = 'android' → FCM
//   * platform = 'ios'     → APNs
//   * platform = 'web'     → FCM web push
//
// Toutes respectent la fenêtre 8h–22h (jamais entre 22h et 8h).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FcmProvider } from './fcm/fcm.provider';
import { ApnsProvider } from './apns/apns.provider';
import type { NotificationKind, PushProvider } from './push.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly fcm: FcmProvider,
    private readonly apns: ApnsProvider,
    private readonly config: ConfigService,
  ) {}

  /// Envoie une notif. `platform` choisit le provider.
  async send(args: {
    platform: 'android' | 'ios' | 'web';
    deviceToken: string;
    payload: {
      title: string;
      body: string;
      kind: NotificationKind;
      deeplink?: string;
    };
  }): Promise<{ sent: boolean; reason?: string; provider: 'fcm' | 'apns' | 'none' }> {
    if (!isWithinNotificationWindow()) {
      this.logger.debug(
        `Hors fenêtre 8h-22h, notif différée: ${args.payload.title}`,
      );
      return { sent: false, reason: 'outside_window', provider: 'none' };
    }
    const provider: PushProvider =
      args.platform === 'ios' ? this.apns : this.fcm;
    const providerName: 'fcm' | 'apns' = args.platform === 'ios' ? 'apns' : 'fcm';
    const result = await provider.send({
      deviceToken: args.deviceToken,
      payload: {
        notification: {
          title: args.payload.title,
          body: args.payload.body,
        },
        data: {
          kind: args.payload.kind,
          deeplink: args.payload.deeplink,
        },
      },
    });
    return { ...result, provider: result.sent ? providerName : 'none' };
  }
}

/// Helper : vérifie la fenêtre horaire autorisée (8h–22h en heure
/// locale serveur). Si on est en dehors, on retourne false et le
/// caller décide de décaler l'envoi.
export function isWithinNotificationWindow(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 8 && hour < 22;
}
