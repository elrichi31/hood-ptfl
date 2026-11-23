import { BaseSchema } from '@adonisjs/lucid/schema'

/** Every history/news query filters or sorts by these columns; without them SQLite scans the table. */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('portfolio_snapshots', (table) => {
      table.index(['created_at'], 'portfolio_snapshots_created_at_index')
    })
    this.schema.alterTable('news_articles', (table) => {
      table.index(['published_at'], 'news_articles_published_at_index')
    })
  }

  async down() {
    this.schema.alterTable('portfolio_snapshots', (table) => {
      table.dropIndex(['created_at'], 'portfolio_snapshots_created_at_index')
    })
    this.schema.alterTable('news_articles', (table) => {
      table.dropIndex(['published_at'], 'news_articles_published_at_index')
    })
  }
}
