import { startPolling } from '#services/poller'
import { startNewsPolling } from '#services/news'
import { startLivePrices } from '#services/live_prices'
import { startDiscover } from '#services/discover'

startPolling()
startNewsPolling()
startLivePrices()
startDiscover()
