// DTOs pour l'échange de clés de deck (Phase 14).
//
// Conformité v2 §8.1 — chiffrement des decks premium téléchargés
// pour offline. La clé AES-256-GCM (deckKey) est livrée au client
// chiffrée en RSA-OAEP avec la clé publique de l'appareil.
//
// Pourquoi RSA-OAEP et pas RSA-PKCS1v1.5 : OAEP est plus sûr
// contre les attaques à chiffré choisi (IND-CCA2). On utilise
// SHA-256 comme fonction de hash (standard pour OAEP aujourd'hui).
import { z } from 'zod';

/// Query : demande de wrapping d'une clé de deck.
/// Le client envoie sa clé publique RSA (PEM, format SPKI).
export const WrapKeyQuery = z.object({
  /// Clé publique RSA du client au format PEM (SubjectPublicKeyInfo).
  client_public_key: z
    .string()
    .min(64)
    .max(8192)
    .regex(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/),
  /// ID de l'appareil (généré côté client, persisté dans
  /// flutter_secure_storage). Sert à lier la clé wrappée à un
  /// device.
  device_id: z.string().min(8).max(64),
});
export type WrapKeyQuery = z.infer<typeof WrapKeyQuery>;

/// Réponse : clé de deck wrappée (chiffrée RSA-OAEP).
export interface WrappedDeckKey {
  /// Clé wrappée en base64 (octets du chiffré RSA-OAEP).
  wrapped_key: string;
  /// Clé AES-256 en clair, encodée hex (40 caractères).
  /// Disponible uniquement côté serveur, en interne.
  deck_key_plaintext?: never; // sérialisé en interne uniquement
  /// Identifiant de la clé RSA côté serveur (pour rotation).
  server_key_id: string;
  /// Algorithme utilisé (toujours "rsa-oaep-sha256" pour l'instant).
  algorithm: 'rsa-oaep-sha256';
  /// Clé AES chiffrée du deck (kid = server key id).
  key_id: string;
}
