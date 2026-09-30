import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { saveSnapshot } from '#services/poller'
import type { getBalance, getPositions } from '#services/portfolio'

const balance: Awaited<ReturnType<typeof getBalance>> = {
  total: 350,
  accounts: [{ type: 'brokerage', nickname: null, totalValue: 350, cash: 50 }],
}
const positions: Awaited<ReturnType<typeof getPositions>> = {
  equities: [{ symbol: 'AAPL', quantity: 2, avgCost: 90, price: 100, value: 200 }],
  crypto: [{ symbol: 'BTC', quantity: 0.001, avgCost: null, price: 100000, value: 100 }],
}

// The test database is isolated in memory; no brokerage calls or application data are touched.
test.group('snapshot persistence', (group) => {
  group.setup(async () => {
    const original = db.primaryConnectionName
    db.manager.add('snapshot_test', {
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    })
    db.primaryConnectionName = 'snapshot_test'
    const client = db.connection()
    await client.schema.createTable('portfolio_snapshots', (table) => {
      table.increments('id')
      table.float('total_value').notNullable()
      table.float('cash').notNullable()
      table.boolean('backfilled').defaultTo(false)
      table.timestamp('created_at').notNullable()
    })
    await client.schema.createTable('position_snapshots', (table) => {
      table.increments('id')
      table
        .integer('portfolio_snapshot_id')
        .notNullable()
        .references('id')
        .inTable('portfolio_snapshots')
      table.string('asset_type').notNullable()
      table.string('symbol').notNullable()
      for (const column of ['quantity', 'price', 'value']) table.float(column).notNullable()
      table.float('avg_cost').nullable()
      table.timestamp('created_at').notNullable()
    })
    return async () => {
      db.primaryConnectionName = original
      await db.manager.close('snapshot_test')
    }
  })
  group.each.setup(async () => {
    await db.from('position_snapshots').delete()
    await db.from('portfolio_snapshots').delete()
  })

  test('commits balance and all equity/crypto positions together', async ({ assert }) => {
    const snapshot = await saveSnapshot(balance, positions)
    const saved = await db.from('portfolio_snapshots').first()
    assert.equal(saved.id, snapshot.id)
    assert.equal(saved.total_value, 350)
    assert.equal(saved.cash, 50)
    const rows = await db.from('position_snapshots').orderBy('id')
    assert.deepEqual(
      rows.map((r) => [r.portfolio_snapshot_id, r.symbol, r.asset_type]),
      [
        [snapshot.id, 'AAPL', 'equity'],
        [snapshot.id, 'BTC', 'crypto'],
      ]
    )
  })

  test('rolls back balance and positions if a position insert fails', async ({ assert }) => {
    const invalid = {
      ...positions,
      crypto: [{ ...positions.crypto[0], symbol: null as unknown as string }],
    }
    await assert.rejects(() => saveSnapshot(balance, invalid), /NOT NULL/)
    assert.lengthOf(await db.from('portfolio_snapshots'), 0)
    assert.lengthOf(await db.from('position_snapshots'), 0)
  })

  test('persists a cash-only snapshot with no positions', async ({ assert }) => {
    await saveSnapshot(balance, { equities: [], crypto: [] })
    assert.lengthOf(await db.from('portfolio_snapshots'), 1)
    assert.lengthOf(await db.from('position_snapshots'), 0)
  })
})
