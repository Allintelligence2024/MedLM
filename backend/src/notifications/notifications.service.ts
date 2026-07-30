// NotificationsService — FCM (Android) + APNs (iOS, Phase 8 bis).
//
// Phase 10 : on livre l'**interface** + une implémentation Firebase
// Cloud Messaging. La clé serveur (`FIREBASE_SERVICE_ACCOUNT_JSON`)
// est obligatoire en prod ; en dev, le service logge et n'envoie
// rien.
//
// Trois types de notifs (v2 §11.3) :
//   * due_reminder  : "Vous avez N cartes dues aujourd'hui"
//   * streak_danger : "Votre streak est en danger, révisez !"
//   * deck_updated  : "Le deck X a été mis à jour"
//
// Toutes respectent la fenêtre 8h–22h (jamais entre 22h et 8h).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type NotificationKind = 'due_reminder' | 'streak_danger' | 'deck_updated';

export interface PushPayload {
  to: string; // FCM device token
  notification: {
    title: string;
    body: string;
  };
  data: {
    kind: NotificationKind;
    deeplink?: string;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly fcmEndpoint = 'https://fcm.googleapis.com/v1/projects';

  constructor(private readonly config: ConfigService) {}

  /// Envoie une notif à un appareil. En dev, logge et retourne
  /// `{ sent: false, reason: 'fcm_disabled' }`.
  async send(args: { deviceToken: string; payload: Omit<PushPayload, 'to'> }) {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const accessToken = await this._getAccessToken();
    if (!projectId || !accessToken) {
      this.logger.warn(
        `FCM non configuré (FIREBASE_PROJECT_ID ou access_token manquant). ` +
          `Notif non envoyée à ${args.deviceToken.slice(0, 10)}…: ${args.payload.notification.title}`,
      );
      return { sent: false, reason: 'fcm_disabled' };
    }
    const body: PushPayload = { to: args.deviceToken, ...args.payload };
    const res = await fetch(
      `${this.fcmEndpoint}/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: body }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`FCM échoué: ${res.status} ${text}`);
      return { sent: false, reason: `fcm_${res.status}` };
    }
    return { sent: true };
  }

  /// Renvoie un access token OAuth2 pour le service account Firebase.
  /// Implémentation Phase 10 : on lit depuis
  /// `GOOGLE_APPLICATION_CREDENTIALS` (variable standard GCP). En
  /// pratique on utilise `google-auth-library` côté Node ; ici on
  /// reste minimal.
  private async _getAccessToken(): Promise<string | null> {
    // Phase 10 : stub. La vraie impl utilise google-auth-library
    // et le JSON du service account.
    return this.config.get<string>('FIREBASE_ACCESS_TOKEN') ?? null;
  }
}

/// Helper : vérifie la fenêtre horaire autorisée (8h–22h en heure
/// locale serveur). Si on est en dehors, on retourne false et le
/// caller décide de décaler l'envoi.
export function isWithinNotificationWindow(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 8 && hour < 22;
}
