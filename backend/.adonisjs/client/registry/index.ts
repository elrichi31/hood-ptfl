/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'portfolio.latest': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/latest',
    tokens: [{"old":"/api/v1/latest","type":0,"val":"api","end":""},{"old":"/api/v1/latest","type":0,"val":"v1","end":""},{"old":"/api/v1/latest","type":0,"val":"latest","end":""}],
    types: placeholder as Registry['portfolio.latest']['types'],
  },
  'history.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/history',
    tokens: [{"old":"/api/v1/history","type":0,"val":"api","end":""},{"old":"/api/v1/history","type":0,"val":"v1","end":""},{"old":"/api/v1/history","type":0,"val":"history","end":""}],
    types: placeholder as Registry['history.index']['types'],
  },
  'history.positions': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/history/positions',
    tokens: [{"old":"/api/v1/history/positions","type":0,"val":"api","end":""},{"old":"/api/v1/history/positions","type":0,"val":"v1","end":""},{"old":"/api/v1/history/positions","type":0,"val":"history","end":""},{"old":"/api/v1/history/positions","type":0,"val":"positions","end":""}],
    types: placeholder as Registry['history.positions']['types'],
  },
  'history.daily': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/history/daily',
    tokens: [{"old":"/api/v1/history/daily","type":0,"val":"api","end":""},{"old":"/api/v1/history/daily","type":0,"val":"v1","end":""},{"old":"/api/v1/history/daily","type":0,"val":"history","end":""},{"old":"/api/v1/history/daily","type":0,"val":"daily","end":""}],
    types: placeholder as Registry['history.daily']['types'],
  },
  'history.references': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/history/references',
    tokens: [{"old":"/api/v1/history/references","type":0,"val":"api","end":""},{"old":"/api/v1/history/references","type":0,"val":"v1","end":""},{"old":"/api/v1/history/references","type":0,"val":"history","end":""},{"old":"/api/v1/history/references","type":0,"val":"references","end":""}],
    types: placeholder as Registry['history.references']['types'],
  },
  'symbol.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/symbol/:symbol',
    tokens: [{"old":"/api/v1/symbol/:symbol","type":0,"val":"api","end":""},{"old":"/api/v1/symbol/:symbol","type":0,"val":"v1","end":""},{"old":"/api/v1/symbol/:symbol","type":0,"val":"symbol","end":""},{"old":"/api/v1/symbol/:symbol","type":1,"val":"symbol","end":""}],
    types: placeholder as Registry['symbol.show']['types'],
  },
  'politician_trades.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/politician-trades',
    tokens: [{"old":"/api/v1/politician-trades","type":0,"val":"api","end":""},{"old":"/api/v1/politician-trades","type":0,"val":"v1","end":""},{"old":"/api/v1/politician-trades","type":0,"val":"politician-trades","end":""}],
    types: placeholder as Registry['politician_trades.index']['types'],
  },
  'news.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/news',
    tokens: [{"old":"/api/v1/news","type":0,"val":"api","end":""},{"old":"/api/v1/news","type":0,"val":"v1","end":""},{"old":"/api/v1/news","type":0,"val":"news","end":""}],
    types: placeholder as Registry['news.index']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
