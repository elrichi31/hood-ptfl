import { startPolling } from '#services/poller'
import { startNewsPolling } from '#services/news'
import { startLivePrices } from '#services/live_prices'
import { startDiscover } from '#services/discover'
import { startInsiders } from '#services/insiders'
import { startRisk } from '#services/risk'

startPolling()
startNewsPolling()
startLivePrices()
startDiscover()
startInsiders()
startRisk()
