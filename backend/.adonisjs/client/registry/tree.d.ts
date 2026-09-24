/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  portfolio: {
    latest: typeof routes['portfolio.latest']
  }
  history: {
    index: typeof routes['history.index']
    positions: typeof routes['history.positions']
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
}
