/// MFA admin — secret TOTP chiffré au repos, codes de secours hashés.
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bytea } from './columns';
import { users } from './users';

export const adminMfa = pgTable('admin_mfa', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretCiphertext: bytea('secret_ciphertext').notNull(),
  secretIv: bytea('secret_iv').notNull(),
  secretTag: bytea('secret_tag').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  lastCounter: bigint('last_counter', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const adminMfaBackupCodes = pgTable(
  'admin_mfa_backup_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hashUnique: uniqueIndex('admin_mfa_backup_codes_hash_idx').on(t.codeHash),
    userIdx: index('admin_mfa_backup_codes_user_idx').on(t.userId),
  }),
);
