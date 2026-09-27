import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'api_usages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('provider').notNullable()
      // UTC date 'YYYY-MM-DD' — the day free-tier quotas reset on.
      table.string('day').notNullable()
      table.integer('calls').notNullable().defaultTo(0)
      table.integer('errors').notNullable().defaultTo(0)
      table.timestamp('updated_at').notNullable()
      table.primary(['provider', 'day'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
