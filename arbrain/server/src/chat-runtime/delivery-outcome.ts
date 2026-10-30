/** How the outbox treats the web's answer to a completion delivery.
 *  - `delivered`: persisted (2xx).
 *  - `gone`: the conversation no longer exists (404/410). Retrying can never
 *    succeed and would only delay live deliveries behind it; the outbox
 *    acknowledges the item and logs it. The journal still holds the result.
 *  - `retry`: anything else (5xx, timeouts, 401 from a stale token…). */
export type DeliveryOutcome = 'delivered' | 'gone' | 'retry'
export function deliveryOutcome(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return 'delivered'
  if (status === 404 || status === 410) return 'gone'
  return 'retry'
}
