/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  portfolio: {
    latest: typeof routes['portfolio.latest']
  }
  history: {
    index: typeof routes['history.index']
    positions: typeof routes['history.positions']
    daily: typeof routes['history.daily']
    references: typeof routes['history.references']
  }
  symbol: {
    show: typeof routes['symbol.show']
  }
  politicianTrades: {
    index: typeof routes['politician_trades.index']
  }
  news: {
    index: typeof routes['news.index']
  }
  usage: {
    index: typeof routes['usage.index']
  }
  risk: {
    index: typeof routes['risk.index']
    returns: typeof routes['risk.returns']
  }
  live: {
    stream: typeof routes['live.stream']
  }
  discover: {
    index: typeof routes['discover.index']
  }
  insiders: {
    index: typeof routes['insiders.index']
  }
}
