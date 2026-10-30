import { describe, it, expect } from 'vitest'
import { DEFAULT_CHAT_EFFORT, effectiveEffort, nearestEffort } from './effort-control.js'

describe('esfuerzo por defecto', () => {
  it('el default es medium', () => {
    expect(DEFAULT_CHAT_EFFORT).toBe('medium')
    expect(nearestEffort(['low', 'medium', 'high', 'xhigh'])).toBe('medium')
  })
  it('sin medium elige el más cercano; en empate, el menor', () => {
    expect(nearestEffort(['high', 'xhigh', 'max'])).toBe('high')
    expect(nearestEffort(['low', 'high'])).toBe('low')
    expect(nearestEffort(['xhigh', 'max'])).toBe('xhigh')
    expect(nearestEffort(['minimal', 'low'])).toBe('low')
  })
  it('sin niveles anunciados no hay esfuerzo', () => {
    expect(nearestEffort([])).toBeNull()
    expect(nearestEffort(null)).toBeNull()
    expect(nearestEffort(['raro'])).toBeNull()
  })
  it('effectiveEffort: lo elegido si el modelo lo anuncia, si no el default', () => {
    expect(effectiveEffort('xhigh', ['low', 'medium', 'xhigh'])).toBe('xhigh')
    expect(effectiveEffort(null, ['low', 'medium', 'xhigh'])).toBe('medium')
    expect(effectiveEffort('max', ['high', 'xhigh'])).toBe('high')
    expect(effectiveEffort('high', [])).toBeNull()
  })
  it('effectiveEffort con modelo aún sin confirmar: lo elegido o el default nominal', () => {
    expect(effectiveEffort('high', null)).toBe('high')
    expect(effectiveEffort(null, null)).toBe('medium')
  })
})
