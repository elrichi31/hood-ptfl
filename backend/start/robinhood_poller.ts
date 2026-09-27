import { startPolling } from '#services/poller'
import { startNewsPolling } from '#services/news'
import { startLivePrices } from '#services/live_prices'

startPolling()
startNewsPolling()
startLivePrices()
