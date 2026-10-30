import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkpointsActivos, opcionesCheckpoint, deshacerDesde, puntoDeRestauracion, respaldar, rehacer, type DeshacerDeps } from './deshacer.js'
import type { TurnRecord } from './journal.js'

const TURNO = '3f2b8c1e-9d4a-4b6e-8f1a-2c3d4e5f6a7b'
const id = { owner: 'o', account: 'default', conversationId: 'c', turnId: TURNO }
const fila = (extra: Partial<TurnRecord> = {}): TurnRecord => ({ ...id, fingerprint: 'f', input: {}, snapshot: null, status: 'completed', nativeThreadId: 'sesion-1', nativeTurnId: TURNO, workerId: null, createdAt: 1, updatedAt: 1, ...extra } as TurnRecord)

function deps(extra: Partial<DeshacerDeps> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deshacer-test-'))
  const archivo = join(dir, 'memoria.md')
  writeFileSync(archivo, 'después')
  const rewindFiles = vi.fn(async (_m: string, o?: { dryRun?: boolean }) => o?.dryRun
    ? { canRewind: true, filesChanged: [archivo], insertions: 1, deletions: 2 }
    : (writeFileSync(archivo, 'antes'), { canRewind: true }))
  const cerrar = vi.fn()
  const d: DeshacerDeps = {
    turno: () => fila(), ocupada: () => false, vivo: () => undefined,
    abrir: vi.fn(async () => ({ q: { rewindFiles }, cerrar })), dirRespaldos: join(dir, 'respaldos'), activo: () => true, ...extra,
  }
  return { d, rewindFiles, cerrar, archivo }
}

describe('checkpoint por config', () => {
  it('encendido por defecto y apagado con ARBRAIN_CHECKPOINTS=0', () => {
    expect(checkpointsActivos({})).toBe(true)
    expect(opcionesCheckpoint({})).toEqual({ enableFileCheckpointing: true })
    for (const v of ['0', 'false', 'off', 'NO']) {
      expect(checkpointsActivos({ ARBRAIN_CHECKPOINTS: v })).toBe(false)
      expect(opcionesCheckpoint({ ARBRAIN_CHECKPOINTS: v })).toEqual({})
    }
  })
  it('apagado: el endpoint no toca el motor', async () => {
    const { d, rewindFiles } = deps({ activo: () => false })
    expect(await deshacerDesde(d, id, { dryRun: true })).toMatchObject({ ok: false, motivo: 'apagado' })
    expect(rewindFiles).not.toHaveBeenCalled()
    expect(d.abrir).not.toHaveBeenCalled()
  })
})

describe('punto de restauración', () => {
  it('solo turnos Claude con el uuid confirmado por el CLI', () => {
    expect(puntoDeRestauracion(fila())).toEqual({ sesion: 'sesion-1', mensaje: TURNO })
    expect(puntoDeRestauracion(fila({ nativeTurnId: null }))).toBeNull()
    expect(puntoDeRestauracion(fila({ nativeTurnId: 'turno-codex-7' }))).toBeNull() // Codex: otro id
    expect(puntoDeRestauracion(fila({ nativeThreadId: null }))).toBeNull()
    expect(puntoDeRestauracion(null)).toBeNull()
  })
})

describe('deshacer desde aquí', () => {
  it('la vista previa llama a rewindFiles con el uuid del mensaje en dryRun y cierra el proceso', async () => {
    const { d, rewindFiles, cerrar, archivo } = deps()
    const v = await deshacerDesde(d, id, { dryRun: true })
    expect(v).toMatchObject({ ok: true, archivos: [archivo], inserciones: 1, borrados: 2 })
    expect(rewindFiles).toHaveBeenCalledTimes(1)
    expect(rewindFiles).toHaveBeenCalledWith(TURNO, { dryRun: true })
    expect(d.abrir).toHaveBeenCalledWith('sesion-1', 'default')
    expect(cerrar).toHaveBeenCalledOnce()
    expect(readFileSync(archivo, 'utf8')).toBe('después')
  })
  it('el real respalda antes, restaura con el id correcto y rehacer devuelve lo de antes', async () => {
    const { d, rewindFiles, archivo } = deps()
    const v = await deshacerDesde(d, id, { dryRun: false })
    expect(rewindFiles.mock.calls.map(c => c[0])).toEqual([TURNO, TURNO])
    expect(rewindFiles.mock.calls[1][1]).toBeUndefined()
    expect(readFileSync(archivo, 'utf8')).toBe('antes')
    expect(v.respaldoId).toMatch(/^[0-9a-f-]{36}$/)
    expect(rehacer(d.dirRespaldos, v.respaldoId!, { conversationId: 'otra' }).ok).toBe(false)
    expect(rehacer(d.dirRespaldos, v.respaldoId!, { conversationId: 'c' })).toMatchObject({ ok: true, archivos: [archivo] })
    expect(readFileSync(archivo, 'utf8')).toBe('después')
  })
  it('usa el proceso vivo de la conversación si está libre (no abre otro)', async () => {
    const vivo = { rewindFiles: vi.fn(async () => ({ canRewind: true, filesChanged: [], insertions: 0, deletions: 0 })) }
    const { d } = deps({ vivo: () => vivo })
    await deshacerDesde(d, id, { dryRun: true })
    expect(vivo.rewindFiles).toHaveBeenCalledWith(TURNO, { dryRun: true })
    expect(d.abrir).not.toHaveBeenCalled()
  })
  it('no rebobina debajo de un turno en curso ni sin punto', async () => {
    const ocupada = deps({ ocupada: () => true })
    expect(await deshacerDesde(ocupada.d, id, { dryRun: false })).toMatchObject({ ok: false, motivo: 'ocupada' })
    expect(ocupada.rewindFiles).not.toHaveBeenCalled()
    const sin = deps({ turno: () => fila({ nativeTurnId: null }) })
    expect(await deshacerDesde(sin.d, id, { dryRun: true })).toMatchObject({ ok: false, motivo: 'sin_punto' })
  })
  it('si el motor dice que no, lo cuenta', async () => {
    const rewindFiles = vi.fn(async () => ({ canRewind: false, error: 'File rewinding is not enabled.' }))
    const { d } = deps({ abrir: async () => ({ q: { rewindFiles }, cerrar: () => {} }) })
    expect(await deshacerDesde(d, id, { dryRun: true })).toMatchObject({ ok: false, motivo: 'sdk', error: 'File rewinding is not enabled.' })
  })
})

describe('respaldo de rehacer', () => {
  it('un archivo que no existía al deshacer se aparta (no se borra) al rehacer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deshacer-resp-'))
    const nuevo = join(dir, 'nuevo.md')
    const r = respaldar(join(dir, 'r'), [nuevo], { turnId: TURNO, conversationId: 'c' })
    writeFileSync(nuevo, 'lo creó el deshacer')
    expect(rehacer(join(dir, 'r'), r, { conversationId: 'c' }).ok).toBe(true)
    expect(existsSync(nuevo)).toBe(false)
    expect(readFileSync(join(dir, 'r', r, '0.apartado'), 'utf8')).toBe('lo creó el deshacer')
  })
})
