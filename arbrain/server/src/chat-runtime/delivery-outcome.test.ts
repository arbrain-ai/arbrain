import { describe, expect, it } from 'vitest'
import { deliveryOutcome } from './delivery-outcome.js'
describe('deliveryOutcome', () => {
  it('acknowledges 2xx, abandons a conversation that no longer exists, retries the rest', () => {
    expect(deliveryOutcome(200)).toBe('delivered')
    expect(deliveryOutcome(202)).toBe('delivered')
    expect(deliveryOutcome(404)).toBe('gone')
    expect(deliveryOutcome(410)).toBe('gone')
    for (const status of [400, 401, 403, 409, 500, 502, 503]) expect(deliveryOutcome(status)).toBe('retry')
  })
})
