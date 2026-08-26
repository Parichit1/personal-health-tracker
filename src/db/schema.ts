import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Phase 1 infrastructure table only — proves the SQLite connection and
 * migration pipeline work end-to-end. No domain tables (nutrition, workouts,
 * activity, weight) are introduced until the phase that needs them.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
