// ApnsProvider — Apple Push Notification service (Phase 14).
//
// Authentification : JWT signé ES256 avec la clé privée .p8
// téléchargée depuis le portail Apple Developer. Header `kid` =
// Key ID, `iss` = Team ID, `iat` = now.
//
// Endpoint : https://api.push.apple.com/3/device/{device_token}
// (production) ou https://api.sandbox.push.apple.com/3/device/{...}
// (sandbox pour les builds dev).
//
// v2 §11.3 — trois types de notifs synchronisés avec FCM :
//   * due_reminder  : "Vous avez N cartes dues aujourd'hui"
//   * streak_danger : "Votre streak est en danger, révisez !"
//   * deck_updated  : "Le deck X a été mis à jour"
//
// Configuration requise (via env) :
//   APNS_TEAM_ID              = "ABCDE12345"
//   APNS_KEY_ID               = "FGHIJ67890"
//   APNS_PRIVATE_KEY_PATH     = "/secrets/AuthKey_FGHIJ67890.p8"
//   APNS_BUNDLE_ID            = "dz.medanki.app"
//   APNS_ENVIRONMENT          = "production" | "sandbox"
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as jose from 'jose'; // p'écarter si pas dispo — fallback
import type { PushPayload } from '../push.types';

@Injectable()
export class ApnsProvider {
  private readonly logger = new Logger(ApnsProvider.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;
  private privateKey: Uint8Array | null = null;

  constructor(private readonly config: ConfigService) {
    const keyPath = this.config.get<string>('APNS_PRIVATE_KEY_PATH');
    if (keyPath && existsSync(resolve(keyPath))) {
      this.privateKey = readFileSync(resolve(keyPath));
    } else {
      this.logger.warn(
        'APNS_PRIVATE_KEY_PATH absent : APNs en mode no-op (dev).',
      );
    }
  }

  async send(args: { deviceToken: string; payload: Omit<PushPayload, 'to'> }): Promise<{ sent: boolean; reason?: string }> {
    const teamId = this.config.get<string>('APNS_TEAM_ID');
    const keyId = this.config.get<string>('APNS_KEY_ID');
    const bundleId = this.config.get<string>('APNS_BUNDLE_ID');
    const env = this.config.get<string>('APNS_ENVIRONMENT') ?? 'sandbox';
    if (!teamId || !keyId || !bundleId || !this.privateKey) {
      this.logger.warn(
        `APNs non configuré. Notif non envoyée à ${args.deviceToken.slice(0, 10)}…: ${args.payload.notification.title}`,
      );
      return { sent: false, reason: 'apns_disabled' };
    }

    const endpoint =
      env === 'production'
        ? 'https://api.push.apple.com'
        : 'https://api.sandbox.push.apple.com';

    const jwt = await this._getProviderToken(teamId, keyId);
    if (!jwt) {
      return { sent: false, reason: 'apns_jwt_failed' };
    }

    const apsPayload = {
      aps: {
        alert: {
          title: args.payload.notification.title,
          body: args.payload.notification.body,
        },
        sound: 'default',
        badge: 1,
        'mutable-content': 1,
      },
      // data additionnels (kind + deeplink)
      kind: args.payload.data.kind,
      deeplink: args.payload.data.deeplink ?? '',
    };

    try {
      const res = await fetch(`${endpoint}/3/device/${args.deviceToken}`, {
        method: 'POST',
        headers: {
          Authorization: `bearer ${jwt}`,
          'apns-topic': bundleId,
          'apns-push-type': 'alert',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apsPayload),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`APNs échoué: ${res.status} ${text}`);
        return { sent: false, reason: `apns_${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      this.logger.error(`APNs exception: ${(e as Error).message}`);
      return { sent: false, reason: 'apns_exception' };
    }
  }

  /// Génère (et cache) un JWT provider pour APNs.
  /// Apple exige un token frais toutes les ~50 min. On le cache
  /// 45 min pour rester safe.
  private async _getProviderToken(teamId: string, keyId: string): Promise<string | null> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.token;
    }
    if (!this.privateKey) return null;
    try {
      // On importe jose dynamiquement (peut être absent en dev).
      const joseModule = await this._loadJose();
      if (!joseModule) return null;
      const key = await joseModule.importPKCS8(
        Buffer.from(this.privateKey).toString('utf8'),
        'ES256',
      );
      const jwt = await new joseModule.SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: keyId })
        .setIssuer(teamId)
        .setIssuedAt()
        .setExpirationTime('50m')
        .sign(key);
      this.cachedToken = { token: jwt, expiresAt: now + 45 * 60_000 };
      return jwt;
    } catch (e) {
      this.logger.error(`APNs JWT signing failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async _loadJose(): Promise<typeof jose | null> {
    try {
      // Import dynamique pour ne pas casser si jose n'est pas installé.
      const mod = await import('jose' as string).catch(() => null);
      return (mod as typeof jose | null) ?? null;
    } catch {
      return null;
    }
  }
}
