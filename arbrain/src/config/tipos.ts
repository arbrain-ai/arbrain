/**
 * Forma de la configuración por instalación (empaquetado, 11 oct 2026; AUDITORIA A12, PORTABILIDAD §4).
 *
 * Todo dato que identifica a la persona dueña de una instalación (correos, cuentas de calendario, rutas, hosts,
 * ids de perfil) vive en UN archivo: `instalacion.ts`. En el repo de Daniel trae los suyos; la copia del alumno
 * lo reemplaza por `instalacion.plantilla.ts` (genérico, sin datos de nadie). El código lo lee de aquí y nunca
 * escribe esos datos a mano.
 */
export interface Instalacion {
  /** Correo de la persona dueña (sesión sintética del escritorio, buzón de avisos, remitente VAPID). */
  correoDueno: string
  /** Correo de trabajo de la persona dueña (segunda cuenta de calendario). '' si no hay. */
  correoNegocio: string
  /** Correos que pueden iniciar sesión en la web publicada y su rol. */
  correosPermitidos: ReadonlyArray<{ correo: string; rol: 'owner' | 'admin' | 'member' }>
  /** Correo de la segunda persona con reportes propios (reporte vivo). '' si no hay. */
  correoReportesSecundario: string
  /** Id del perfil de la persona dueña en su base (dueño de lienzos y tareas creadas por agentes). */
  idPerfilDueno: string
  /** Id del agente Levy en la base (tabla de agentes): autor de lo que el calendario crea por API. '' si no hay. */
  idAgenteLevy: string
  /** Id del perfil de la segunda persona del equipo (organigrama). '' si no hay. */
  idPerfilSecundario: string
  /** Calendario de Google del objetivo del día. '' si no hay. */
  calendarioObjetivoId: string
  /** Raíz del repo cuando no llega por variable (`BUSINESS_OS_ROOT`/`ARBRAIN_HOME`). '' = sin respaldo. */
  raizRepoRespaldo: string
  /** Biblioteca personal de libros (PDF). '' = no existe. */
  bibliotecaPersonal: string
  /** URL pública del Storage propio (imágenes del chat). '' = no hay. */
  storagePublico: string
  /** Host:puerto del Storage propio, para `next/image`. null = no hay. */
  storageImagenes: { protocol: 'https' | 'http'; hostname: string; port: string } | null
  /** URL pública de la web (correos de confirmación, enlaces). '' = solo local. */
  urlSitio: string
  /** Proyecto Supabase de la comunidad (analítica). '' = no hay. */
  proyectoComunidad: string
  /** Dominios propios que sirven esta misma app (enlaces que se abren dentro de Arbrain). */
  dominiosPropios: string[]
  /** Lector de libros publicados. '' = no hay. */
  urlLibros: string
  /**
   * Las personas de la instalación. `clave` es el valor que viaja en datos y rutas (vista diario, reportes, rutinas,
   * aprobaciones); `nombre` es como se le nombra en textos y prompts. `segunda` es la segunda persona con cuenta (si hay).
   */
  personas: {
    dueno: { clave: string; nombre: string; nombreCompleto: string }
    segunda: { clave: string; nombre: string }
  }
  /** Firma con la que se previsualiza un post en el feed de la comunidad. null = sin previa. */
  firmaFeed: { nombre: string; foto: string } | null
  /** Finanzas: nombres legibles y colores de las cuentas propias. */
  finanzas: { nombresCuentas: Record<string, string>; coloresCuentas: Record<string, string> }
  /**
   * Atajos de teclado de los hábitos: clave del hábito → tecla ('1'…'0', '⇧1'). Mapa de identidad (nunca derivado del
   * orden de una lista); las claves retiradas se quedan reservadas. Es de la instalación porque las claves son los
   * hábitos de esa persona.
   */
  atajosHabitos: Readonly<Record<string, string>>
  /**
   * Una temporada de hábitos (22 oct 2026, el monk mode de Daniel hasta Monterrey). Solo su nombre y `arranque`, el primer día
   * que cuenta (la historia, las rachas y los porcentajes empiezan ahí; antes no se rellena nada). Inicio, cierre y premio los
   * pone `periodo` (una sola fuente, Daniel 22 oct): sin `periodo` no hay temporada, ni cuadrícula ni cuenta regresiva.
   */
  temporadaHabitos?: { nombre: string; arranque: string }
  /**
   * El periodo con premio que se ve en el Calendario (Día, Semana y Mes, junto al objetivo): «Día N de total · premio» y lo
   * que debe estar cumplido antes de cerrarlo (22 oct 2026, Daniel: «quiero ver alguna interfaz que diga… uno de 30 y tantos»).
   * `desde` es el día 1 y `hasta` el día del cierre (ya fuera de la cuenta: `total` = días de `desde` a `hasta`): el día de SALIDA
   * al premio, porque lo de `cumplir` es «antes de llegar». `viaje` son las fechas del premio; `firmado: false` las marca «por
   * firmar». La temporada de hábitos lee de aquí su inicio, cierre y premio. Opcional: sin esto no se pinta nada.
   */
  periodo?: { desde: string; hasta: string; premio: string; viaje?: { desde: string; hasta: string; firmado: boolean }; cumplir: readonly string[] }
  /**
   * Lo que se propone la primera vez en la fila «Hábitos de hoy» (Atomic Habits): la identidad y, por hábito, la señal
   * (hora sugerida) y su versión de 2 minutos. Se editan en la fila y se guardan aparte (`/api/sistema/atomicos`).
   */
  habitosAtomicos?: { identidad: string; habitos: Readonly<Record<string, { senal: string; dosMinutos: string; privado?: boolean; alias?: string }>> }
  /** Respaldo de GOG_KEYRING_PASSWORD si el entorno no lo trae (calendario por `gog`). '' = no hay. */
  gogKeyring: string
  /**
   * Cómo se describen en el selector del chat los espacios de cuenta de la instalación original (subtítulo por id de
   * espacio; `banner:<id>` es el texto del aviso «Corriendo en …»). Opcional: sin esto salen descripciones neutras. Red team 3 (A-7): quién comparte qué suscripción es un
   * dato de la instalación, no del código.
   */
  etiquetasCuentasChat?: Readonly<Record<string, string>>
}
