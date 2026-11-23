import { DateTime } from 'luxon'

/**
 * Datetime literal in the exact text format Lucid stores for SQLite ('YYYY-MM-DD HH:mm:ss', process
 * zone, same as what writes produce). Always compare datetime columns against this, never a JS
 * Date: knex hands SQLite a Date as a number, and a number is always smaller than the stored text,
 * so `created_at >= <Date>` matched every row and every "last N days" query read the whole table.
 */
export const sqlTime = (value: Date | DateTime) =>
  (value instanceof Date ? DateTime.fromJSDate(value) : value).toFormat('yyyy-MM-dd HH:mm:ss')
