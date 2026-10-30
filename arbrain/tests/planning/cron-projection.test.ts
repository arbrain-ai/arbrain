import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {projectOccurrences} from '../../src/features/calendar/utils/cronProjection'
test('future windows include their exact midnight boundary and do not walk years of old next-run',()=>{
 const from=Date.parse('2030-01-01T06:00:00Z'),to=Date.parse('2030-01-03T06:00:00Z')
 const items=projectOccurrences('0 0 * * *',from,to,1700000000,'America/Mexico_City')
 assert.deepEqual(items,[from,from+86400000])
})
test('authoritative next occurrence is not duplicated',()=>{
 const from=Date.parse('2030-01-01T06:00:00Z'),to=from+86400000
 const items=projectOccurrences('0 * * * *',from,to,from/1000,'America/Mexico_City')
 assert.equal(items[0],from);assert.equal(new Set(items).size,items.length)
})
