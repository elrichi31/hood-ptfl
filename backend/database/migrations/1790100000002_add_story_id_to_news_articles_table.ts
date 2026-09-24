import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'news_articles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Id of the first article of the same story, set by TypeSafe story linking in
      // #services/news (own id when it starts a story). Null = not linked yet / no key.
      table.integer('story_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('story_id')
    })
  }
}
