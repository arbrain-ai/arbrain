import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { internas, observarEvento, olvidarEnMemoria, vaciar } from './internos.js'

beforeEach(() => { process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'internos-poda-')); olvidarEnMemoria() })

// 2 oct: los Bash de los subagentes (decenas por minuto) empujaban fuera de las 80 a los subagentes
// de fondo que seguían corriendo; el panel mostraba «N terminadas hoy» y ningún «trabajando».
it('un subagente que sigue trabajando no sale de la lista aunque lleguen muchos comandos después', async () => {
  const ctx = { conversationId: 'c1', turnId: 't1' }
  observarEvento(ctx, { type: 'task_started', taskId: 'agente', description: 'Investigar el motor', taskType: 'local_agent' })
  for (let i = 0; i < 120; i++) {
    observarEvento(ctx, { type: 'task_started', taskId: `bash-${i}`, description: `comando ${i}`, taskType: 'local_bash' })
    observarEvento(ctx, { type: 'task_notification', taskId: `bash-${i}`, status: 'completed' })
  }
  const lista = await vaciar().then(internas)
  expect(lista.find(t => t.id === 'agente')).toMatchObject({ estado: 'trabajando', tipo: 'subagente' })
  expect(lista.filter(t => t.estado !== 'trabajando')).toHaveLength(80)
})
