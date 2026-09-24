import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'news_articles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // JSON NewsAi from #services/typesafe — null until classified (or no API key).
      table.text('ai').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('ai')
    })
  }
}
