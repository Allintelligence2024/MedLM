/// Schéma Drizzle — états OAuth2 (state CSRF).
///
/// Le state est généré par le serveur, stocké sous forme d'empreinte
/// SHA-256, et consommé de façon atomique lors du callback Google.
/// Cela empêche le rejeu et les attaques CSRF.
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

export const oauthStates = pgTable(
  'oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiresIdx: index('oauth_states_expires_idx').on(t.expiresAt),
    createdIdx: index('oauth_states_created_idx').on(t.createdAt),
  }),
);
