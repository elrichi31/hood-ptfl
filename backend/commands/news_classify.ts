import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { classifyPending } from '#services/news'
import { getPositions } from '#services/portfolio'

/** Runs TypeSafe over unclassified feed articles now instead of waiting for the next poll. */
export default class NewsClassify extends BaseCommand {
  static commandName = 'news:classify'
  static description = 'Classify pending news articles with TypeSafe (needs TYPESAFE_API_KEY)'
  static options: CommandOptions = { startApp: true }

  async run() {
    const { equities } = await getPositions()
    await classifyPending(equities)
  }
}
