// EntitlementService — émet et vérifie des JWT signés RS256 destinés à
// l'app mobile. Le mobile les stocke dans Keystore / Secure Enclave et
// les utilise HORS LIGNE pour afficher le paywall.
//
// Payload (v2 §8.1) :
//   { user_id, plan, expires_at, grace_until, allowed_decks[], device_id }
//
// TTL 24h. Avant l'expiration, le mobile rafraîchit via
// GET /v1/entitlement/jwt.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createPublicKey } from 'node:crypto';
import { z } from 'zod';
import {
  resolveVerificationKey,
  InsecureJwtConfigError,
} from '../auth/jwt-config';
import { BillingService } from '../billing/billing.service';

export interface EntitlementJwtPayload {
  user_id: string;
  plan: 'free' | 'premium' | 'promo';
  device_id: string;
  expires_at: number;
  grace_until: number | null;
  allowed_decks: string[];
}

const EntitlementClaims = z.object({
  kind: z.literal('entitlement'),
  user_id: z.string().min(1),
  device_id: z.string().min(1),
  plan: z.enum(['free', 'premium', 'promo']),
  expires_at: z.number().int().nonnegative(),
  grace_until: z.number().int().nonnegative().nullable(),
  allowed_decks: z.array(z.string()),
  exp: z.number().int().positive(),
});

@Injectable()
export class EntitlementService {
  private readonly publicKey: string | null;
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {
    const verification = resolveVerificationKey({
      publicKeyPath: this.config.get<string>('JWT_PUBLIC_KEY_PATH'),
      signingKeyPath: this.config.get<string>('JWT_SIGNING_KEY_PATH'),
      readKey: (path) => readFileSync(resolve(path), 'utf8'),
      derivePublic: (pem) =>
        createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString(),
    });
    this.publicKey = verification.publicKey;
    if (
      !this.publicKey &&
      (
        this.config.get<string>('NODE_ENV') ??
        process.env.NODE_ENV ??
        ''
      ).toLowerCase() === 'production'
    ) {
      throw new InsecureJwtConfigError(
        'clé publique entitlement introuvable et non dérivable',
      );
    }
    this.ttlSeconds = Number(
      this.config.get<string | number>('JWT_ENTITLEMENT_TTL_SECONDS') ?? 86_400,
    );
    if (!Number.isSafeInteger(this.ttlSeconds) || this.ttlSeconds <= 0) {
      throw new Error(
        'JWT_ENTITLEMENT_TTL_SECONDS doit être un entier positif',
      );
    }
  }

  /// Émet un nouveau JWT d'entitlement pour l'utilisateur courant.
  async issue(
    userId: string,
    deviceId: string,
  ): Promise<{ jwt: string; expires_at: number; token_expires_at: number }> {
    const state = await this.billing.currentEntitlement(userId);
    const payload: EntitlementJwtPayload = {
      user_id: userId,
      plan: state.plan,
      device_id: deviceId,
      expires_at: state.expiresAtMs,
      grace_until: state.graceUntilMs || null,
      // allowed_decks sera calculé en Phase 11 (CMS) ; pour l'instant,
      // un entitlement premium débloque tous les decks publiés.
      allowed_decks: state.isActive ? ['*'] : [],
    };
    const jwt = await this.jwt.signAsync(
      { ...payload, kind: 'entitlement' },
      { expiresIn: this.ttlSeconds, algorithm: 'RS256' },
    );
    return {
      jwt,
      expires_at: payload.expires_at,
      token_expires_at:
        Math.floor(Date.now() / 1000) * 1000 + this.ttlSeconds * 1000,
    };
  }

  /// Vérifie un JWT (utilisé par le mobile, mais aussi par d'éventuels
  /// endpoints serveur en cas de besoin).
  async verify(jwt: string): Promise<EntitlementJwtPayload> {
    if (!this.publicKey)
      throw new UnauthorizedException('vérification RS256 indisponible');
    try {
      const decoded: unknown = await this.jwt.verifyAsync(jwt, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
      });
      // A valid access JWT is not an entitlement. Require a typed, expiring
      // payload as well as a valid signature; never enable an HS256 fallback.
      return EntitlementClaims.parse(decoded);
    } catch {
      throw new UnauthorizedException('jeton entitlement invalide');
    }
  }
}
