import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { sqlTime } from '#services/sql_time'

test.group('sqlTime', () => {
  test('formats like the text Lucid stores, so string comparison orders correctly', ({
    assert,
  }) => {
    const a = DateTime.fromObject({ year: 2026, month: 11, day: 9, hour: 8, minute: 5, second: 3 })
    assert.equal(sqlTime(a), '2026-11-09 08:05:03')
    assert.equal(sqlTime(a.toJSDate()), '2026-11-09 08:05:03')
    assert.isTrue(sqlTime(a) < sqlTime(a.plus({ seconds: 1 })))
    assert.isTrue(sqlTime(a) < sqlTime(a.plus({ days: 40 })))
  })
})
