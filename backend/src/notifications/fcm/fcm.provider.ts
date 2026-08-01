// FcmProvider — Firebase Cloud Messaging (Android, web).
//
// Authentification (audit P1-3) : compte de service Google + flux JWT
// bearer. On signe une assertion RS256, on l'échange contre un access
// token OAuth2, et on met CELUI-CI en cache avec renouvellement
// anticipé (5 min de marge).
//
// Avant ce correctif, `_getAccessToken()` retournait la variable
// d'environnement `FIREBASE_ACCESS_TOKEN` telle quelle. Les access
// tokens Google expirant en ~1 h, l'envoi de notifications se serait
// arrêté une heure après le déploiement — sans erreur visible autre
// qu'un warning par notification perdue.
//
// Configuration (cf. backend/.env.example) :
//   FIREBASE_PROJECT_ID
//   FIREBASE_SERVICE_ACCOUNT_PATH  (chemin du JSON) — ou
//   FIREBASE_SERVICE_ACCOUNT_JSON  (contenu inline, secret manager)
//   FIREBASE_ACCESS_TOKEN          (échappatoire dev/test uniquement)
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PushPayload } from '../push.types';
import {
  buildAssertion,
  isTokenUsable,
  parseServiceAccount,
  parseTokenResponse,
  type CachedToken,
  type ServiceAccount,
  FCM_SCOPE,
  GOOGLE_TOKEN_URI,
} from './fcm-oauth';

@Injectable()
export class FcmProvider {
  private readonly logger = new Logger(FcmProvider.name);
  private readonly fcmEndpoint = 'https://fcm.googleapis.com/v1/projects';

  private cachedToken: CachedToken | null = null;
  private serviceAccount: ServiceAccount | null = null;
  private serviceAccountResolved = false;
  /// Évite N échanges de jetons concurrents au démarrage d'un batch.
  private inFlight: Promise<string | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  /// Envoie une notif FCM. Retourne `{ sent: boolean, reason?: string }`.
  async send(args: {
    deviceToken: string;
    payload: Omit<PushPayload, 'to'>;
  }): Promise<{ sent: boolean; reason?: string }> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const accessToken = await this.getAccessToken();
    if (!projectId || !accessToken) {
      this.logger.warn(
        `FCM non configuré. Notif non envoyée à ${args.deviceToken.slice(0, 10)}…: ${args.payload.notification.title}`,
      );
      return { sent: false, reason: 'fcm_disabled' };
    }
    const body: PushPayload = { to: args.deviceToken, ...args.payload };
    try {
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
        // 401 : le token a été révoqué avant son expiration annoncée.
        // On vide le cache pour que la prochaine tentative en reprenne
        // un frais plutôt que de rejouer un token mort en boucle.
        if (res.status === 401) this.cachedToken = null;
        this.logger.error(`FCM échoué: ${res.status} ${text}`);
        return { sent: false, reason: `fcm_${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      this.logger.error(`FCM exception: ${(e as Error).message}`);
      return { sent: false, reason: 'fcm_exception' };
    }
  }

  /// Access token OAuth2 valide, ou `null` si FCM n'est pas configuré.
  ///
  /// Public pour être exerçable en test sans passer par `send()`.
  async getAccessToken(nowMs: number = Date.now()): Promise<string | null> {
    // Échappatoire explicite (dev, CI, staging) : token statique fourni
    // à la main. Jamais viable en production — d'où le warning.
    const staticToken = this.config.get<string>('FIREBASE_ACCESS_TOKEN');
    if (staticToken) {
      this.logger.warn(
        'FIREBASE_ACCESS_TOKEN utilisé : token statique, expire en ~1 h. ' +
          'À réserver au développement — configurer un compte de service en production.',
      );
      return staticToken;
    }

    if (isTokenUsable(this.cachedToken, nowMs)) {
      return this.cachedToken!.accessToken;
    }

    const account = this.loadServiceAccount();
    if (!account) return null;

    // Un seul échange à la fois, quel que soit le nombre d'appelants.
    this.inFlight ??= this.exchange(account, nowMs).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async exchange(
    account: ServiceAccount,
    nowMs: number,
  ): Promise<string | null> {
    try {
      const assertion = await buildAssertion(account, nowMs, FCM_SCOPE);
      const res = await fetch(account.token_uri ?? GOOGLE_TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      });
      if (!res.ok) {
        this.logger.error(
          `Échange de jeton Google échoué: ${res.status} ${await res.text()}`,
        );
        return null;
      }
      const parsed = parseTokenResponse(await res.json(), nowMs);
      if (!parsed) {
        this.logger.error('Réponse de jeton Google inexploitable');
        return null;
      }
      this.cachedToken = parsed;
      return parsed.accessToken;
    } catch (e) {
      this.logger.error(`Échange de jeton échoué: ${(e as Error).message}`);
      return null;
    }
  }

  /// Charge le compte de service (fichier ou inline), une seule fois.
  private loadServiceAccount(): ServiceAccount | null {
    if (this.serviceAccountResolved) return this.serviceAccount;
    this.serviceAccountResolved = true;

    const inline = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (inline) {
      this.serviceAccount = parseServiceAccount(inline);
      if (!this.serviceAccount) {
        this.logger.error('FIREBASE_SERVICE_ACCOUNT_JSON illisible');
      }
      return this.serviceAccount;
    }

    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (path && existsSync(resolve(path))) {
      this.serviceAccount = parseServiceAccount(
        readFileSync(resolve(path), 'utf8'),
      );
      if (!this.serviceAccount) {
        this.logger.error(`Compte de service illisible : ${path}`);
      }
      return this.serviceAccount;
    }

    this.logger.warn(
      'Aucun compte de service Firebase configuré : FCM en mode no-op.',
    );
    return null;
  }
}
