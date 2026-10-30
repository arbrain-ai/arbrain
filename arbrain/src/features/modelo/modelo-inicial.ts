import { esEspacioClaude } from '@/shared/lib/espacios-chat'
import { nombreModelo } from '@/shared/lib/uso-modelo'
import { modelosDelSelector, type Catalogo, type ModeloCatalogo } from './catalogo-modelos'

/**
 * Con qué modelo nace una conversación nueva (3 oct 2026). Regla de Daniel: el ÚLTIMO que usó; un modelo
 * deshabilitado (o no disponible) jamás; si el recordado ya no está encendido, el primero encendido en el orden de
 * Configuración → Modelos (Claude primero, luego OpenRouter, en el orden del catálogo). Nunca un default fijo.
 * Módulo puro. Pruebas: tests/modelo/modelo-inicial.test.ts.
 */
export interface UltimoUso { motor: string | null; modelo: string | null; esfuerzo?: string | null }
export interface InicioChat {
  /** Espacio del chat donde nace. null = no hay catálogo para decidir: no tocar el activo. */
  cuenta: string | null
  /** Modelo de Claude a aplicar al nacer (solo si el espacio es de Claude); null = el de la cuenta. */
  modelo: string | null
  /** El recordado no estaba disponible y se cayó al primero encendido. */
  cayo: boolean
}

const mismoModelo = (m: ModeloCatalogo, modelo: string | null): boolean =>
  !!modelo && (m.modelo === modelo || nombreModelo(modelo) === m.nombre)

/** ¿El último uso sigue siendo un modelo encendido y disponible? Devuelve su fila del catálogo. */
export function filaDelUso(c: Catalogo, uso: UltimoUso | null): ModeloCatalogo | null {
  if (!uso?.motor) return null
  const { claude, openrouter } = modelosDelSelector(c)
  if (esEspacioClaude(uso.motor)) {
    if (!uso.modelo) return claude[0] ?? null
    return claude.find(m => mismoModelo(m, uso.modelo)) ?? null
  }
  return openrouter.find(m => m.cuenta === uso.motor) ?? null
}

export function inicioDeChatNuevo(c: Catalogo | null, uso: UltimoUso | null): InicioChat {
  if (!c) return { cuenta: null, modelo: null, cayo: false }
  const recordado = filaDelUso(c, uso)
  if (recordado) {
    const claude = recordado.via === 'suscripcion'
    return { cuenta: claude && uso?.motor ? uso.motor : recordado.cuenta, modelo: claude ? (uso?.modelo ?? recordado.modelo) : null, cayo: false }
  }
  const { claude, openrouter } = modelosDelSelector(c)
  const primero = claude[0] ?? openrouter[0] ?? null
  if (!primero) return { cuenta: 'default', modelo: null, cayo: true }
  return { cuenta: primero.cuenta, modelo: primero.via === 'suscripcion' ? primero.modelo : null, cayo: true }
}

/** ¿El espacio activo corre un modelo encendido? (corrige el arranque con un espacio guardado que ya se apagó) */
export function espacioVigente(c: Catalogo | null, espacio: string): boolean {
  if (!c) return true
  const { claude, openrouter } = modelosDelSelector(c)
  return esEspacioClaude(espacio) ? claude.length > 0 : openrouter.some(m => m.cuenta === espacio)
}
