import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {bufferedRange,coversRange} from '../../src/features/planning/read-window'
test('preload neighbors while respecting backend window and history scope',()=>{
 const week={from:'2026-09-07T06:00:00Z',to:'2026-09-14T06:00:00Z'}
 const buffered=bufferedRange(week,14)
 assert.equal((Date.parse(buffered.to)-Date.parse(buffered.from))/86400000,35)
 assert.ok(coversRange(buffered,{from:'2026-09-14T06:00:00Z',to:'2026-09-21T06:00:00Z'}))
 const month=bufferedRange({from:'2026-08-31T06:00:00Z',to:'2026-10-12T06:00:00Z'},14)
 assert.ok((Date.parse(month.to)-Date.parse(month.from))/86400000<=64)
 assert.ok(!coversRange(buffered,{...week,includeCompleted:'true'}))
 assert.ok(coversRange({...buffered,includeCompleted:'true'},week))
})
