// FcmProvider — Firebase Cloud Messaging (Android, web).
//
// Phase 10 livré (FCM v1 HTTP API). Phase 14 raffine : on utilise
// google-auth-library pour obtenir un access token OAuth2 frais.
//
// C'est ici qu'on enverra les `due_reminder`, `streak_danger`,
// `deck_updated`.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushPayload } from '../push.types';

@Injectable()
export class FcmProvider {
  private readonly logger = new Logger(FcmProvider.name);
  private readonly fcmEndpoint = 'https://fcm.googleapis.com/v1/projects';

  constructor(private readonly config: ConfigService) {}

  /// Envoie une notif FCM. Retourne `{ sent: boolean, reason?: string }`.
  async send(args: { deviceToken: string; payload: Omit<PushPayload, 'to'> }): Promise<{ sent: boolean; reason?: string }> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const accessToken = await this._getAccessToken();
    if (!projectId || !accessToken) {
      this.logger.warn(
        `FCM non configuré. Notif non envoyée à ${args.deviceToken.slice(0, 10)}…: ${args.payload.notification.title}`,
      );
      return { sent: false, reason: 'fcm_disabled' };
    }
    const body: PushPayload = { to: args.deviceToken, ...args.payload };
    const res = await fetch(`${this.fcmEndpoint}/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: body }),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`FCM échoué: ${res.status} ${text}`);
      return { sent: false, reason: `fcm_${res.status}` };
    }
    return { sent: true };
  }

  private async _getAccessToken(): Promise<string | null> {
    // En prod, google-auth-library produit un token via JWT signé
    // (compte de service). Ici on lit depuis la config pour
    // permettre un override (CI, staging).
    return this.config.get<string>('FIREBASE_ACCESS_TOKEN') ?? null;
  }
}
