/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

router.get('/', () => {
  return { hello: 'world' }
})

router
  .group(() => {
    router.get('latest', [controllers.Portfolio, 'latest'])
    router.get('history', [controllers.History, 'index'])
    router.get('history/positions', [controllers.History, 'positions'])
    router.get('symbol/:symbol', [controllers.Symbol, 'show'])
    router.get('politician-trades', [controllers.PoliticianTrades, 'index'])
    router.get('news', [controllers.News, 'index'])
  })
  .prefix('/api/v1')
  .use(middleware.internalToken())
