/**
 * Locale de date-fns del idioma activo (13 nov 2026). Reemplaza los `{ locale: es }` fijos:
 *   format(d, tr("d 'de' MMMM"), { locale: localeFechas() })
 * El patrón de formato también es texto traducible: en inglés el orden cambia ('MMMM d').
 */
import { enUS, es, type Locale } from 'date-fns/locale'
import { idiomaActual } from './tr'

export function localeFechas(): Locale {
  return idiomaActual() === 'en' ? enUS : es
}
