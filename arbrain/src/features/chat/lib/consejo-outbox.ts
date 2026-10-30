/** Durable envelopes are independent: another tab may neither overwrite nor acknowledge yours. */
export interface OutboxStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export function saveEnvelope<T extends {turnId:string}>(storage:OutboxStorage, prefix:string, envelope:T):void {
  const key = `${prefix}:${envelope.turnId}`
  const raw = JSON.stringify(envelope)
  const old = storage.getItem(key)
  if (old && old !== raw) throw new Error('El envío conservado no coincide; recupera el original.')
  storage.setItem(key, raw)
}
export function pendingEnvelopes<T extends {turnId:string}>(storage:OutboxStorage,prefix:string):T[] {
  // Migrate the former single slot without discarding its original identity.
  const legacy=storage.getItem(prefix)
  if(legacy) {
    try { const e=JSON.parse(legacy) as T; if(e.turnId){saveEnvelope(storage,prefix,e);storage.removeItem(prefix)} } catch { /* preserve malformed legacy data */ }
  }
  const result:T[]=[]
  for(let i=0;i<storage.length;i++) {
    const key=storage.key(i)
    if(!key?.startsWith(`${prefix}:`))continue
    try {const e=JSON.parse(storage.getItem(key) || '') as T;if(e.turnId && key===`${prefix}:${e.turnId}`)result.push(e)} catch { /* unrelated or malformed data is never sent */ }
  }
  return result
}
export function acknowledgeEnvelope(storage:OutboxStorage,prefix:string,turnId:string):void {
  storage.removeItem(`${prefix}:${turnId}`)
}
