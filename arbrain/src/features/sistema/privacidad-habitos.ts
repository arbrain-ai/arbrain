import { instalacion } from '@/config'
import type { PrincipioHabito } from '@/lib/sistema/atomicos'
import { useAlmacenAtomicos } from './useAtomicos'

/**
 * La privacidad de un hábito sin pasar `p` por cada componente (28 oct 2026): lo guardado en `/api/sistema/atomicos` o, mientras
 * llega (o si falla), la propuesta de la instalación. Así un privado nunca asoma su nombre real en el primer pintado, tampoco en
 * superficies que no leen los principios (Metas, teléfono, la tabla de Todotask).
 */
export function principioHabito(clave: string): PrincipioHabito | undefined {
  return useAlmacenAtomicos.getState().data?.habitos[clave] ?? instalacion().habitosAtomicos?.habitos[clave]
}
export const esHabitoPrivado = (clave: string) => !!principioHabito(clave)?.privado
