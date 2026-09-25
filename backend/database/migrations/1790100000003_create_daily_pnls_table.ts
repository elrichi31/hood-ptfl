import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'daily_pnls'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // ET trading date, 'YYYY-MM-DD'. Recomputed from snapshots by #services/daily_pnl.
      table.string('day').primary()
      table.decimal('pnl', 14, 2).notNullable()
      table.decimal('pct', 10, 4).nullable()
      table.decimal('start_value', 14, 2).notNullable()
      table.decimal('end_value', 14, 2).notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
