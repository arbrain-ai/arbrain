/**
 * Prueba controlada de entrega (goal 2 de la Cabina). Usa la cola y el cliente
 * reales contra un webhook de PRUEBA (no el de Daniel) y una base temporal:
 *   node dist/cabina/prueba-entrega.js <url-webhook> <db-temporal> enviar|procesar|estado
 * El evento es `silent` con un job de prueba: solo deja fila en conversations,
 * sin chat, sin campana y sin push.
 */
import Database from 'better-sqlite3'
import { McOutbox } from '../mc-outbox.js'
import { enviarEvento } from '../mc-client.js'

const [url, dbPath, accion] = process.argv.slice(2)
const box = new McOutbox(new Database(dbPath), p => enviarEvento(p, url), Date.now, p => console.log('ALERTA', JSON.stringify(p)))
const runId = 'cron-prueba-entrega-cabina-20260930'
if (accion === 'enviar') console.log('entregado al momento:', await box.entregar({ action: 'end', runId, agentId: 'levy', prompt: 'prueba-entrega-cabina', response: 'Prueba de entrega con reintento (Cabina goal 2).', source: 'cron', silent: true, timestamp: new Date().toISOString() }))
if (accion === 'procesar') console.log('entregados en este ciclo:', await box.procesar())
console.log('pendientes:', JSON.stringify(box.pendientes()))
