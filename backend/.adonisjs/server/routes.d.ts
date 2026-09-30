import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'portfolio.latest': { paramsTuple?: []; params?: {} }
    'history.index': { paramsTuple?: []; params?: {} }
    'history.positions': { paramsTuple?: []; params?: {} }
    'history.daily': { paramsTuple?: []; params?: {} }
    'history.references': { paramsTuple?: []; params?: {} }
    'symbol.show': { paramsTuple: [ParamValue]; params: {'symbol': ParamValue} }
    'politician_trades.index': { paramsTuple?: []; params?: {} }
    'news.index': { paramsTuple?: []; params?: {} }
    'usage.index': { paramsTuple?: []; params?: {} }
    'risk.index': { paramsTuple?: []; params?: {} }
    'risk.returns': { paramsTuple: [ParamValue]; params: {'symbol': ParamValue} }
    'live.stream': { paramsTuple?: []; params?: {} }
    'discover.index': { paramsTuple?: []; params?: {} }
    'insiders.index': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'portfolio.latest': { paramsTuple?: []; params?: {} }
    'history.index': { paramsTuple?: []; params?: {} }
    'history.positions': { paramsTuple?: []; params?: {} }
    'history.daily': { paramsTuple?: []; params?: {} }
    'history.references': { paramsTuple?: []; params?: {} }
    'symbol.show': { paramsTuple: [ParamValue]; params: {'symbol': ParamValue} }
    'politician_trades.index': { paramsTuple?: []; params?: {} }
    'news.index': { paramsTuple?: []; params?: {} }
    'usage.index': { paramsTuple?: []; params?: {} }
    'risk.index': { paramsTuple?: []; params?: {} }
    'risk.returns': { paramsTuple: [ParamValue]; params: {'symbol': ParamValue} }
    'live.stream': { paramsTuple?: []; params?: {} }
    'discover.index': { paramsTuple?: []; params?: {} }
    'insiders.index': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'portfolio.latest': { paramsTuple?: []; params?: {} }
    'history.index': { paramsTuple?: []; params?: {} }
    'history.positions': { paramsTuple?: []; params?: {} }
    'history.daily': { paramsTuple?: []; params?: {} }
    'history.references': { paramsTuple?: []; params?: {} }
    'symbol.show': { paramsTuple: [ParamValue]; params: {'symbol': ParamValue} }
    'politician_trades.index': { paramsTuple?: []; params?: {} }
    'news.index': { paramsTuple?: []; params?: {} }
    'usage.index': { paramsTuple?: []; params?: {} }
    'risk.index': { paramsTuple?: []; params?: {} }
    'risk.returns': { paramsTuple: [ParamValue]; params: {'symbol': ParamValue} }
    'live.stream': { paramsTuple?: []; params?: {} }
    'discover.index': { paramsTuple?: []; params?: {} }
    'insiders.index': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}