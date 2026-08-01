/// Schéma Drizzle — device_tokens (audit P1-3).
///
/// SQL source de vérité : migrations/0017_device_tokens.sql.
///
/// Le chaînon manquant des notifications : sans cette table, le backend
/// savait construire et envoyer un push, mais n'avait aucune adresse de
/// destination.
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const devicePlatforms = ['android', 'ios', 'web'] as const;
export type DevicePlatform = (typeof devicePlatforms)[number];

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /// Identifiant d'appareil généré côté client (SecureTokenStorage).
    deviceId: text('device_id').notNull(),
    /// Jeton d'acheminement FCM/APNs. Adresse, pas secret d'auth.
    token: text('token').notNull(),
    platform: text('platform').notNull(),
    appVersion: text('app_version'),
    locale: text('locale'),
    /// Non-null = appareil injoignable (désinstallation détectée par le
    /// provider). On désactive au lieu de supprimer.
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    disabledReason: text('disabled_reason'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userDeviceKey: uniqueIndex('device_tokens_user_device_key').on(
      t.userId,
      t.deviceId,
    ),
    tokenIdx: index('device_tokens_token_idx').on(t.token),
    userActiveIdx: index('device_tokens_user_active_idx').on(
      t.userId,
      t.disabledAt,
    ),
  }),
);
