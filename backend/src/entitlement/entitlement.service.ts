// EntitlementService — émet et vérifie des JWT signés RS256 destinés à
// l'app mobile. Le mobile les stocke dans Keystore / Secure Enclave et
// les utilise HORS LIGNE pour afficher le paywall.
//
// Payload (v2 §8.1) :
//   { user_id, plan, expires_at, grace_until, allowed_decks[], device_id }
//
// TTL 24h. Avant l'expiration, le mobile rafraîchit via
// GET /v1/billing/entitlement (qui retourne un nouveau JWT).
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { BillingService } from '../billing/billing.service';

export interface EntitlementJwtPayload {
  user_id: string;
  plan: 'free' | 'premium' | 'promo';
  device_id: string;
  expires_at: number;
  grace_until: number | null;
  allowed_decks: string[];
}

@Injectable()
export class EntitlementService {
  private readonly publicKey: string | null;
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {
    const pubKeyPath = this.config.get<string>('JWT_PUBLIC_KEY_PATH');
    this.publicKey = pubKeyPath && existsSync(resolve(pubKeyPath))
      ? readFileSync(resolve(pubKeyPath), 'utf8')
      : null;
    this.ttlSeconds = this.config.get<number>('JWT_ENTITLEMENT_TTL_SECONDS') ?? 86_400;
  }

  /// Émet un nouveau JWT d'entitlement pour l'utilisateur courant.
  async issue(userId: string, deviceId: string): Promise<{ jwt: string; expires_at: number }> {
    const state = await this.billing.currentEntitlement(userId);
    const payload: EntitlementJwtPayload = {
      user_id: userId,
      plan: state.plan,
      device_id: deviceId,
      expires_at: Date.now() + this.ttlSeconds * 1000,
      grace_until: state.graceUntilMs || null,
      // allowed_decks sera calculé en Phase 11 (CMS) ; pour l'instant,
      // un entitlement premium débloque tous les decks publiés.
      allowed_decks: state.isActive ? ['*'] : [],
    };
    const jwt = await this.jwt.signAsync(
      { ...payload, kind: 'entitlement' },
      { expiresIn: this.ttlSeconds, algorithm: 'RS256' },
    );
    return { jwt, expires_at: payload.expires_at };
  }

  /// Vérifie un JWT (utilisé par le mobile, mais aussi par d'éventuels
  /// endpoints serveur en cas de besoin).
  async verify(jwt: string): Promise<EntitlementJwtPayload> {
    return this.jwt.verifyAsync(jwt, {
      ...(this.publicKey !== null && this.publicKey !== undefined && { publicKey: this.publicKey }),
      algorithms: this.publicKey ? ['RS256'] : ['HS256'],
    }) as Promise<EntitlementJwtPayload>;
  }
}
