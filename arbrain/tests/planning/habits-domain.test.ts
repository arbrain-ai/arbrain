import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { civilToday, habitRange, isCivilDate, shiftDay } from '../../src/features/sistema/calendar-days'
import { HABIT_SHORTCUTS, habitKey } from '../../src/features/sistema/habit-shortcuts'

test('civil day is local across midnight and DST, historical range anchored to requested date', () => {
  assert.equal(civilToday('America/Mexico_City', new Date('2026-09-14T02:00:00Z')), '2026-09-13')
  assert.equal(civilToday('Asia/Tokyo', new Date('2026-09-13T23:00:00Z')), '2026-09-14')
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09')
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31')
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29')
  assert.equal(isCivilDate('2026-02-29'), false)
  assert.equal(isCivilDate('2026-13-01'), false)
  const range = habitRange(new URLSearchParams('date=2024-02-29&days=7'))
  assert.equal(range.from, '2024-02-23')
  assert.equal(range.to, '2024-02-29')
  for (const query of ['days=NaN','days=-1','days=367','date=2026-02-30','timeZone=invalid','from=2026-02-01&to=2026-01-01']) {
    assert.throws(() => habitRange(new URLSearchParams(query)))
  }
})

test('eleven stable identities; shifted physical digit works on every keyboard layout', () => {
  const event = { code:'Digit1', shiftKey:false, ctrlKey:false, altKey:false, metaKey:false, repeat:false, isComposing:false }
  assert.equal(habitKey(event), 'objetivo_dia')
  assert.equal(habitKey({...event, shiftKey:true}), 'ayuno')
  assert.equal(habitKey({...event, code:'Digit0'}), 'cafe_90')
  assert.equal(habitKey({...event, code:'Digit2', shiftKey:true}), null)
  for (const flag of ['repeat','isComposing','metaKey','altKey','ctrlKey']) {
    assert.equal(habitKey({...event, [flag]:true}), null)
  }
  assert.equal(new Set(Object.values(HABIT_SHORTCUTS)).size, 11)
  const reversed = Object.keys(HABIT_SHORTCUTS).reverse()
  assert.equal(reversed.find((key) => HABIT_SHORTCUTS[key] === '1'), 'objetivo_dia')
  assert.equal(HABIT_SHORTCUTS.unknown_new_habit, undefined)
})
