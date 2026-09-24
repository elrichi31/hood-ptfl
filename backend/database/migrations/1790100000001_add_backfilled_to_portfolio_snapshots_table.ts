import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'portfolio_snapshots'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // true = reconstructed from historical bars by `node ace portfolio:backfill`, not a live poll.
      table.boolean('backfilled').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('backfilled')
    })
  }
}
