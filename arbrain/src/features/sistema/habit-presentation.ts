import {isCivilDate} from './calendar-days'
import {nombrePublico} from '@/lib/sistema/atomicos'
import {principioHabito} from './privacidad-habitos'
/** Daniel's split, confirmed 13 Sep. The date is civil, never the server weekday. */
export function workoutForDay(day:string):string {
 if(!isCivilDate(day))return 'Entrenamiento'
 const weekday=new Date(day+'T12:00:00Z').getUTCDay()
 return ['Natación','Pierna','Brazo, espalda y abs','Pecho, tríceps y hombros','Pierna','Brazo, espalda y abs','Pecho, tríceps y hombros'][weekday]
}
/** Un privado sale como «Hábito 3» (28 oct 2026); para revelarlo con el cursor, `NombreHabito` con `realHabitName`. */
export function habitDisplayName(h:{clave:string;nombre:string},day:string):string {
 return nombrePublico(realHabitName(h,day),principioHabito(h.clave))
}
export function realHabitName(h:{clave:string;nombre:string},day:string):string {
 return h.clave==='entrenamiento'?`Entrenamiento · ${workoutForDay(day)}`:h.nombre
}
/** Lo que agrupa un hábito compuesto (5 oct 2026, modo monje: tres hábitos). Vive aquí porque `sistema_habitos` no tiene campo de descripción. */
const SUBTITULOS: Record<string, string> = { rutina_matutina: 'Ducha fría · abs · lagartijas · yoga · creatina, agua y sal' }
export function habitSubtitle(clave: string): string | null { return SUBTITULOS[clave] ?? null }
