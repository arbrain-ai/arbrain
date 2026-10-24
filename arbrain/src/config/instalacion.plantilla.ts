/**
 * Configuración de la instalación del alumno (empaquetado, 11 oct 2026). Forma y reglas en `tipos.ts`.
 * El generador de la copia la escribe como `instalacion.ts`. Sin datos de nadie: la persona dueña es «tú».
 */
import type { Instalacion } from './tipos'

export const INSTALACION: Instalacion = {
  correoDueno: 'tu@arbrain.local',
  correoNegocio: '',
  correosPermitidos: [{ correo: 'tu@arbrain.local', rol: 'owner' }],
  correoReportesSecundario: '',
  // El usuario sintético de la app de escritorio (LOCAL_DESKTOP_USER_ID): la persona dueña de su instalación.
  idPerfilDueno: '00000000-0000-4000-8000-000000000001',
  idAgenteLevy: '',
  idPerfilSecundario: '',
  calendarioObjetivoId: '',
  raizRepoRespaldo: '',
  bibliotecaPersonal: '',
  storagePublico: '',
  storageImagenes: null,
  urlSitio: '',
  proyectoComunidad: '',
  dominiosPropios: [],
  urlLibros: '',
  gogKeyring: '',
  personas: {
    dueno: { clave: 'dueno', nombre: 'la persona dueña', nombreCompleto: 'Tú' },
    segunda: { clave: 'segunda', nombre: 'tu socio' },
  },
  firmaFeed: null,
  finanzas: { nombresCuentas: {}, coloresCuentas: {} },
  // Sin espacios de cuenta extra: el chat del alumno usa su llave (el selector no se muestra en cliente).
  etiquetasCuentasChat: {},
  // Atajos de ejemplo para un catálogo de hábitos genérico; la persona los ajusta a los suyos.
  // Sin temporada de fábrica: la persona la arma con su Levy y vive en `<su cerebro>/.claude/plan/temporada.json`
  // (`lib/planning/temporada-cli.ts`, `/api/planning/temporada`), que manda sobre estos dos. Mientras no exista, la franja
  // del Calendario invita «Arma tu temporada con Levy» y «Hábitos de hoy» no muestra cuadrícula ni cuenta regresiva.
  temporadaHabitos: undefined,
  periodo: undefined,
  // La identidad y los principios de cada hábito los escribe la persona en la fila.
  habitosAtomicos: { identidad: '', habitos: {} },
  atajosHabitos: {
    objetivo_dia: '1', dormir: '2', lectura: '3', luz_am: '4', ducha_fria: '5',
    entrenamiento: '6', sauna: '7', nsdr: '8', ducha_caliente: '9', cafe_90: '0', ayuno: '⇧1',
  },
}
