/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'portfolio.latest': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/latest'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/portfolio_controller').default['latest']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/portfolio_controller').default['latest']>>>
    }
  }
  'history.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/history'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/history_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/history_controller').default['index']>>>
    }
  }
  'history.positions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/history/positions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/history_controller').default['positions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/history_controller').default['positions']>>>
    }
  }
  'history.daily': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/history/daily'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/history_controller').default['daily']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/history_controller').default['daily']>>>
    }
  }
  'history.references': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/history/references'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/history_controller').default['references']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/history_controller').default['references']>>>
    }
  }
  'symbol.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/symbol/:symbol'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { symbol: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/symbol_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/symbol_controller').default['show']>>>
    }
  }
  'politician_trades.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/politician-trades'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/politician_trades_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/politician_trades_controller').default['index']>>>
    }
  }
  'news.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/news'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/news_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/news_controller').default['index']>>>
    }
  }
}
