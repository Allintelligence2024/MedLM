/// Schéma Drizzle — défis d'authentification (magic link, challenges
/// à usage unique).
///
/// Remplace l'ancien jeton JWT `kind:'magic'` (rejouable jusqu'à
/// expiration, sans traçabilité côté serveur). Ici le token brut n'est
/// JAMAIS stocké : seule son empreinte SHA-256 (`token_hash`) l'est, avec
/// une expiration courte et un drapeau de consommation permettant le
/// rejet du rejeu.
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    /// Fenêtre de validité : 15 minutes maximum.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /// Renseigné exactement au moment de la première consommation ;
    /// une ligne ayant `used_at` non nul est définitivement refusée.
    usedAt: timestamp('used_at', { withTimezone: true }),
    /// Adresse IP à l'origine de la demande — sert au rate limiting
    /// (5 demandes / 15 min / IP, indépendamment de l'email).
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index('auth_challenges_token_hash_idx').on(t.tokenHash),
    emailIdx: index('auth_challenges_email_idx').on(t.email),
    ipIdx: index('auth_challenges_ip_idx').on(t.ipAddress),
    createdIdx: index('auth_challenges_created_idx').on(t.createdAt),
  }),
);
