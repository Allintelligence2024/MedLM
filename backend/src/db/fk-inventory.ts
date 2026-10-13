/// Contrat nominatif des FK (R05). Pas un compteur.
///
/// Chaque entrée DOIT exister dans pg_constraint après 0027.
/// onDelete : CASCADE uniquement hors journaux append-only.
export type FkOnDelete = 'CASCADE' | 'SET NULL' | 'RESTRICT';

export interface ForeignKeySpec {
  name: string;
  table: string;
  column: string;
  foreignTable: string;
  foreignColumn: string;
  onDelete: FkOnDelete;
}

export const REQUIRED_FOREIGN_KEYS: ForeignKeySpec[] = [
  {
    name: 'modules_programme_id_fkey',
    table: 'modules',
    column: 'programme_id',
    foreignTable: 'programmes',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'decks_module_id_fkey',
    table: 'decks',
    column: 'module_id',
    foreignTable: 'modules',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'cards_deck_id_fkey',
    table: 'cards',
    column: 'deck_id',
    foreignTable: 'decks',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'card_versions_card_id_fkey',
    table: 'card_versions',
    column: 'card_id',
    foreignTable: 'cards',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'study_sessions_deck_id_fkey',
    table: 'study_sessions',
    column: 'deck_id',
    foreignTable: 'decks',
    foreignColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    name: 'user_devices_user_id_fkey',
    table: 'user_devices',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'refresh_tokens_user_id_fkey',
    table: 'refresh_tokens',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'refresh_tokens_device_id_fkey',
    table: 'refresh_tokens',
    column: 'device_id',
    foreignTable: 'user_devices',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'entitlements_user_id_fkey',
    table: 'entitlements',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'cards_created_by_fkey',
    table: 'cards',
    column: 'created_by',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    name: 'cards_reviewed_by_fkey',
    table: 'cards',
    column: 'reviewed_by',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    name: 'card_versions_changed_by_fkey',
    table: 'card_versions',
    column: 'changed_by',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    name: 'card_reports_card_id_fkey',
    table: 'card_reports',
    column: 'card_id',
    foreignTable: 'cards',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'card_reports_user_id_fkey',
    table: 'card_reports',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'review_logs_user_id_fkey',
    table: 'review_logs',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    name: 'review_logs_card_id_fkey',
    table: 'review_logs',
    column: 'card_id',
    foreignTable: 'cards',
    foreignColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    name: 'srs_card_state_user_id_fkey',
    table: 'srs_card_state',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    name: 'srs_card_state_card_id_fkey',
    table: 'srs_card_state',
    column: 'card_id',
    foreignTable: 'cards',
    foreignColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    name: 'study_sessions_user_id_fkey',
    table: 'study_sessions',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    name: 'sync_cursors_user_id_fkey',
    table: 'sync_cursors',
    column: 'user_id',
    foreignTable: 'users',
    foreignColumn: 'id',
    onDelete: 'CASCADE',
  },
];
