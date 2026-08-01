// Schéma Drizzle — deck_key_wrapped (Phase 14).
//
// Table de distribution des clés AES-256-GCM pour les decks
// premium. Chaque ligne = une clé wrappée en RSA-OAEP-SHA256
// pour un couple (user, device, deck).
//
// v2 §8.1 : le serveur ne stocke JAMAIS la clé AES en clair.
// Quand la clé est wrappée et émise, c'est fini — on ne peut
// plus la relire. C'est le principe de forward secrecy.
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { bytea } from './columns';
import { users } from './users';
import { decks } from './content';

export const deckKeyWrapped = pgTable(
  'deck_key_wrapped',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deckId: uuid('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
    /// ID de l'appareil (UUID v4 côté client, persisté dans le
    /// secure storage).
    deviceId: text('device_id').notNull(),
    /// Clé wrappée (RSA-OAEP-SHA256, octets bruts).
    wrappedKey: bytea('wrapped_key').notNull(),
    /// Algorithme (toujours "rsa-oaep-sha256" pour l'instant).
    algorithm: text('algorithm').notNull().default('rsa-oaep-sha256'),
    /// Révocation : si non-null, la clé a été révoquée (rotation
    /// naturelle, perte d'appareil, grace expired).
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDeckDeviceIdx: index('deck_key_wrapped_user_deck_device_idx').on(
      t.userId,
      t.deckId,
      t.deviceId,
    ),
    userActiveIdx: index('deck_key_wrapped_user_active_idx').on(
      t.userId,
      t.revokedAt,
    ),
  }),
);
