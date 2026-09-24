import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'news_articles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      table.string('provider').notNullable()
      // Dedupe key within a provider (their article id, or a hash of the url when
      // they don't give one) — repeated polls upsert on this instead of duplicating.
      table.string('external_id').notNullable()

      table.string('headline').notNullable()
      table.text('description').notNullable()
      table.text('summary').notNullable()
      table.string('url').notNullable()
      table.string('source_name').notNullable()
      // JSON array of uppercase tickers this article mentions — parsed in #services/news.
      table.text('tickers').notNullable()

      table.timestamp('published_at').notNullable()
      table.float('sentiment_score').notNullable()
      table.float('relevance_raw').notNullable()

      table.timestamp('created_at').notNullable()

      table.unique(['provider', 'external_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
