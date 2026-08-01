// DeckKeysService — Phase 14.
//
// Responsabilités :
//   * Génère une `deckKey` AES-256 (32 octets) par deck premium.
//   * La wrappe en RSA-OAEP-SHA256 avec la clé publique de
//     l'appareil client.
//   * La persiste en DB (table `deck_key_wrapped`) pour pouvoir
//     la re-livrer à un device autorisé sans la re-générer.
//   * Permet la rotation : on peut révoquer toutes les clés
//     wrappées d'un user (grace expired → wipe local).
//
// v2 §8.1 — « Revocation : next sync → new key or wipe si grace
// expired ». L'implémentation de la revocation est dans le
// EntitlementService (Phase 7). Ici on gère uniquement la
// distribution des clés.
//
// Note : la clé AES n'est JAMAIS envoyée en clair au client
// (chiffrée par la clé publique RSA du device). Le serveur ne
// stocke que la version wrappée.
import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';

import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes, createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { decks } from '../db/schema/content';
import { deckKeyWrapped } from '../db/schema/deck-keys';
import { WrappedDeckKey } from './deck-keys.dto';

@Injectable()
export class DeckKeysService {
  private readonly logger = new Logger(DeckKeysService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /// GET /v1/decks/:id/wrap-key?client_public_key=...&device_id=...
  /// Wrap la clé de déchiffrement du deck pour l'appareil client.
  /// Si aucune clé n'existe encore pour ce (deck, device), on en
  /// génère une nouvelle.
  async wrapKey(args: {
    userId: string;
    deckId: string;
    clientPublicKeyPem: string;
    deviceId: string;
  }): Promise<WrappedDeckKey> {
    // 1. Vérifier que le deck existe et est premium.
    const deck = await this.db
      .select({ id: decks.id, isPremium: decks.isPremium })
      .from(decks)
      .where(eq(decks.id, args.deckId))
      .then((rows) => rows[0]);
    if (!deck) throw new NotFoundException('deck introuvable');
    if (!deck.isPremium) {
      // Pas de wrap pour les decks gratuits : ils sont en clair.
      throw new BadRequestException('deck gratuit, pas de wrap nécessaire');
    }

    // 2. Vérifier la clé publique RSA du client (parsing + taille).
    let clientKey: ReturnType<typeof createPublicKey>;
    try {
      clientKey = createPublicKey(args.clientPublicKeyPem);
    } catch (e) {
      throw new BadRequestException(`clé publique client invalide : ${(e as Error).message}`);
    }
    const details = clientKey.asymmetricKeyDetails;
    if ((details?.modulusLength ?? 0) < 2048) {
      throw new BadRequestException(
        `clé RSA trop faible (${details?.modulusLength ?? '?'} bits, minimum 2048)`,
      );
    }

    // 3. Récupérer la clé wrappée existante ou en créer une.
    let existing = await this.db
      .select()
      .from(deckKeyWrapped)
      .where(
        and(
          eq(deckKeyWrapped.deckId, args.deckId),
          eq(deckKeyWrapped.userId, args.userId),
          eq(deckKeyWrapped.deviceId, args.deviceId),
          isNull(deckKeyWrapped.revokedAt),
        ),
      )
      .then((rows) => rows[0]);

    let deckKey: Buffer;
    if (existing) {
      // On régénère la clé AES à chaque wrap (rotation naturelle).
      // L'ancienne clé wrappée est marquée révoquée.
      deckKey = randomBytes(32);
      await this.db
        .update(deckKeyWrapped)
        .set({ revokedAt: new Date() })
        .where(eq(deckKeyWrapped.id, existing.id));
      const wrapped = publicEncrypt(
        {
          key: clientKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        deckKey,
      );
      const id = await this._insert(args, deckKey, wrapped);
      this.logger.log(
        `deck key rotated: user=${args.userId} deck=${args.deckId} device=${args.deviceId.slice(0, 8)}… id=${id}`,
      );
      return {
        wrapped_key: wrapped.toString('base64'),
        server_key_id: 'rsa-oaep-2025',
        algorithm: 'rsa-oaep-sha256',
        key_id: id,
      };
    }

    // Nouvelle clé.
    deckKey = randomBytes(32);
    const wrapped = publicEncrypt(
      {
        key: clientKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      deckKey,
    );
    const id = await this._insert(args, deckKey, wrapped);
    this.logger.log(
      `deck key issued: user=${args.userId} deck=${args.deckId} device=${args.deviceId.slice(0, 8)}… id=${id}`,
    );
    return {
      wrapped_key: wrapped.toString('base64'),
      server_key_id: 'rsa-oaep-2025',
      algorithm: 'rsa-oaep-sha256',
      key_id: id,
    };
  }

  /// DELETE /v1/decks/:id/wrap-key?device_id=... — révoque la
  /// clé d'un device (par exemple, perte du téléphone).
  async revokeKey(args: { userId: string; deckId: string; deviceId: string }): Promise<{ revoked: number }> {
    const result = await this.db
      .update(deckKeyWrapped)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(deckKeyWrapped.deckId, args.deckId),
          eq(deckKeyWrapped.userId, args.userId),
          eq(deckKeyWrapped.deviceId, args.deviceId),
        ),
      )
      .returning({ id: deckKeyWrapped.id });
    this.logger.log(
      `deck key revoked: user=${args.userId} deck=${args.deckId} device=${args.deviceId.slice(0, 8)}… count=${result.length}`,
    );
    return { revoked: result.length };
  }

  /// Révoque TOUTES les clés d'un user (appelé quand l'entitlement
  /// devient grace expired). Cf. EntitlementService.
  async revokeAllForUser(userId: string): Promise<{ revoked: number }> {
    const result = await this.db
      .update(deckKeyWrapped)
      .set({ revokedAt: new Date() })
      .where(and(eq(deckKeyWrapped.userId, userId), isNull(deckKeyWrapped.revokedAt)))
      .returning({ id: deckKeyWrapped.id });
    this.logger.log(`deck keys revoked for user=${args_string(userId)} count=${result.length}`);
    return { revoked: result.length };
  }

  private async _insert(
    args: { userId: string; deckId: string; deviceId: string },
    _deckKey: Buffer,
    wrapped: Buffer,
  ): Promise<string> {
    // Note : on ne stocke PAS le deckKey en clair en DB — uniquement
    // la version wrappée. Le serveur n'a aucun moyen de relire la
    // clé après émission (forward secrecy).
    const rows = await this.db
      .insert(deckKeyWrapped)
      .values({
        deckId: args.deckId,
        userId: args.userId,
        deviceId: args.deviceId,
        wrappedKey: wrapped,
        algorithm: 'rsa-oaep-sha256',
      })
      .returning({ id: deckKeyWrapped.id });
    return rows[0]!.id;
  }
}

function args_string(s: string): string {
  return s;
}
