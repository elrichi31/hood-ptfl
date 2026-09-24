import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('portfolio_snapshot_id')
        .notNullable()
        .references('id')
        .inTable('portfolio_snapshots')
        .onDelete('CASCADE')
      table.string('asset_type').notNullable() // 'equity' | 'crypto'
      table.string('symbol').notNullable()
      table.decimal('quantity', 20, 8).notNullable()
      table.decimal('avg_cost', 14, 4).nullable()
      table.decimal('price', 14, 4).notNullable()
      table.decimal('value', 14, 4).notNullable()

      table.timestamp('created_at').notNullable()

      table.index(['symbol'])
      table.index(['portfolio_snapshot_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
