/**
 * La Cabina — las manos de Levy sobre la interfaz de Arbrain.
 *
 * Dos verbos: `mostrar` pinta una vista viva DENTRO de la conversación y
 * `abrir` lleva a Daniel a la sección completa de Arbrain (3 oct 2026: nada saca de Arbrain; sfcal y sfmap
 * quedan como nombres viejos que caen en Calendario y Lienzo).
 *
 * El contrato es deliberadamente pequeño: la herramienta NO devuelve datos ni
 * HTML. Lo que se persiste es la INVOCACIÓN (vista + parámetros) dentro del
 * snapshot del turno; el cliente monta el componente real y lee la fuente viva
 * cada vez. Así una conversación recargada muestra datos frescos, no una foto.
 *
 * Este módulo es puro (sin SDK ni red) para que lo compartan el servidor MCP
 * por stdio del runtime de Claude y las dynamicTools del runtime de Codex.
 */

import { DUENO, DUENO_M, PERSONAS, PERSONA_DUENO, REPO_TXT, SEGUNDA, SITIOS_VIGILADOS, dueno } from '../dueno.js'
import { validarDocumento } from './documento.js'
import { esEdicionCliente } from '../edicion.js'
import { CABINA_SUBAGENTES } from '../cliente/politica-agentes.js'
import { describir, guardar as guardarEnArchivero, leer as leerArchivero, limpiarVista, pedirAbrir, sacar as sacarDelArchivero } from './archivero.js'
import { anotarBitacora, clientesVivos, describirPanel, emitir, esperarAcuses, esperarAjustes, informe } from './panel-bus.js'
import { aplicar as aplicarAjustes, describir as describirAjustesTodas, DONDES, idDeSeccion, leer as leerAjustes, NOMBRES as NOMBRES_SECCION, NOMBRES_DONDE, SECCIONES } from './panel-ajustes.js'

export const VISTAS = ['calendario', 'objetivos', 'centro', 'lienzo', 'reporte', 'negocio', 'trabajos', 'finanzas', 'contenido', 'rutinas', 'servidores', 'memoria', 'equipo', 'documento', 'diario', 'salud', 'pizarron', 'masterclass', 'explorador', 'cohorte'] as const
export const QUIENES = PERSONAS
export const SECCIONES_NEGOCIO = ['avatar', 'oferta', 'embudo', 'sistema'] as const
export const DESTINOS = ['calendario', 'objetivos', 'hoy', 'centro', 'contenido', 'lienzo', 'rutinas', 'finanzas', 'sfcal', 'sfmap'] as const
export const ALCANCES = ['dia', 'semana', 'mes'] as const

export type Vista = typeof VISTAS[number]
export type Destino = typeof DESTINOS[number]
export type Alcance = typeof ALCANCES[number]

/**
 * Edición cliente (carril U, 11 oct 2026): lo único que existe en la app del alumno. Misma lista que la web
 * (arbrain/src/lib/edicion.ts › VISTAS_CLIENTE y SECCIONES_PANEL_CLIENTE); el resto son vistas del negocio de la
 * instalación original y no se ofrecen ni se aceptan.
 */
export const VISTAS_CLIENTE = ['calendario', 'lienzo', 'memoria', 'documento', 'explorador'] as const satisfies readonly Vista[]
export const DESTINOS_CLIENTE = ['lienzo'] as const satisfies readonly Destino[]
export const SECCIONES_PANEL_CLIENTE = ['calendario', 'lienzo', 'explorador', 'taller'] as const satisfies readonly (typeof SECCIONES)[number][]
/** Vistas de `mostrar` según la edición. */
export const vistasEdicion = (cliente = esEdicionCliente()): readonly Vista[] => cliente ? VISTAS_CLIENTE : VISTAS
/** Destinos de `abrir` según la edición. */
export const destinosEdicion = (cliente = esEdicionCliente()): readonly Destino[] => cliente ? DESTINOS_CLIENTE : DESTINOS

export interface MostrarInput { vista: Vista; alcance?: Alcance; fecha?: string; paginaId?: string; titulo?: string; enfoque?: string; seccion?: typeof SECCIONES_NEGOCIO[number]; agenteId?: number; fijar?: boolean; zona?: string; ruta?: string; compararCon?: string; versiones?: string[]; tiempo?: number; soltar?: boolean; pestana?: string; guardar?: boolean; quien?: typeof QUIENES[number]; telefono?: boolean }
export interface AbrirInput { destino: Destino; alcance?: Alcance; fecha?: string; paginaId?: string; zona?: string; motivo?: string }

export const MOSTRAR_DESCRIPTION = `Muestra a ${DUENO}, DENTRO de esta conversación de Arbrain, una vista viva con sus datos reales (no un dibujo): la app monta el componente y lee la fuente en vivo; al recargar la conversación vuelve con datos frescos, y se refresca sola cuando escribes por las plumas canónicas.
Vistas: calendario (alcance dia|semana|mes, fecha ancla YYYY-MM-DD; eventos de Google y tareas de Todoist) · objetivos (alcance dia|semana|mes; metas del plan con su criterio de éxito) · centro (abre Finanzas · Lo que entra: Command Center se fue el 6 oct y sus 3 cifras —MRR, suscripciones y cancelación prevista de Polar reconciliado, con su corte— van arriba de Finanzas; nombre conservado por compatibilidad) · lienzo (una página de canvas v4 por paginaId, p. ej. el plan mensual que compusiste con la skill canvas) · reporte (lo que llegó: avisos sin leer de la campana y los reportes de los crons —diario, cierre, semanal, mensual— con su texto; alcance dia = solo hoy, semana = 7 días, sin alcance = lo pendiente) · negocio (el libro del negocio: avatar, oferta LT/HT, embudo y sistema, cada uno con su canónico y fecha de revisión; seccion enfoca una tarjeta) · trabajos (lo que corre en el Studio desde el motor de Arbrain (o, si el motor no responde, por el gate de SFTerm): cada agente con su conversación real —cualquiera de los 7 harness—, estado y tokens; subagentes que lanzaste con el tope de paralelo y de tokens del día; terminales adoptadas de SFTerm; servidores escuchando y servicios; agenteId enfoca uno) · finanzas (arriba «Lo que entra»: lo COBRADO según Polar, con «Polar · corte <fecha>»; debajo lo REGISTRADO con ${SEGUNDA} en Finance OS, sin mezclarlos: lo registrado en los últimos 30 días, cobros fijos, próximos cargos y runway con la fecha de su cierre; lo no registrado dice «sin registrar») · rutinas (los crons de Levy: cuántos trabajan, cuáles fallaron, cuándo corren y su último resultado; no opera nada; desde el 5 oct abre Taller › Rutinas en el panel, con las tareas programadas del Studio, y no se pinta en el chat) · servidores (¿abre lo que usan tus miembros? ${SITIOS_VIGILADOS} comprobados desde afuera por HTTPS con certificado y tiempo, el mensajero de avisos y los correos de anuncios; tu cerebro en el Studio con nombre humano; Studio y VPS con disco y memoria. Semáforo ok/lento/caído/sin dato y una frase en español llano de qué pasa; se revisa sola cada 5 min y avisa a la campana si algo de los miembros cae 2 revisiones seguidas; desde el 5 oct vive en el Taller: mostrarla abre Taller › Máquina en el panel, con los procesos del Studio y su dueño debajo —huérfanos con «Apagar», lo de cada conversación, la Casa y los servicios por área con sus fallas explicadas—, y no se pinta en el chat) · memoria (memoria y contexto: lo que Levy sabe de ${DUENO} —toda .claude/memory por tipo, con buscador, fecha y lectura, sin credenciales— y la anatomía MEDIDA de la ventana de esta conversación: system prompt del proveedor, CLAUDE.md y sus imports, skills, herramientas, lo inyectado por los hooks en su último mensaje, el historial y la barra de la ventana; úsala cuando pregunte qué recuerdas de él o qué entra en tu contexto; desde el 5 oct abre Taller › Memoria en el panel —memorias, habilidades, documentos, las instrucciones que entran en cada conversación (CLAUDE.md, MEMORY.md, now.md) y el contexto— y no se pinta en el chat) · equipo (el organigrama vivo: ${DUENO} dueño, ${SEGUNDA} administración y comunidad, la próxima contratación y los agentes Levy, Trinity y Sensei con su cara; por persona qué le llega —su reporte de las 09:00 y su campana—, de qué se encarga y su último movimiento en Arbrain; es la vista de administrador de ${DUENO} para ver el negocio desde arriba) · contenido (videos publicados este mes por semana contra la meta y los últimos con vistas y retención; vistas no son ventas) · diario (el reporte de la mañana VIVO, el mismo que llega a las 09:00 al hilo Reportes: dinero de ayer en Polar, embudo del lanzamiento con «sin medir» honesto, la agenda del día con el bloque en curso y las tareas de hoy que se palomean ahí mismo; fecha = día del reporte; quien:${PERSONAS[1] ?? 'otra'} = el de ${SEGUNDA}: comunidad sin respuesta, bienvenidas, quién dejó de entrar y comentarios de YouTube) · salud (el cuerpo de hoy desde el reloj: una lectura de una palabra —con margen, en tu normal, señales cruzadas, pide calma, vigila— con qué hacer amarrado al objetivo del día; la noche con hora de dormir y fases; cada métrica contra SU banda propia (p25–p75 de sus últimos 60 días) con tendencias de 7 y 30 días; la tira de 30 días con «sin medir» rayado; sus hábitos contra la noche siguiente solo con ≥5 días por lado, si no dice cuántas muestras faltan; y la pantalla «Conecta tu reloj» para quien no tiene datos. No afirmes cifras del cuerpo sin abrirla) · masterclass (la masterclass del sáb 17 oct 12:00 desde su fuente única docs/business-os/lanzamiento-ht-15-oct/masterclass/masterclass-17-oct.json: la cuenta regresiva y cuántos de los 10 bloques están listos; el gran dominó propuesto con el firmado plegado y su estado; la línea de tiempo de las 2 horas con cada bloque a escala y el color de su parte de Brunson; cada bloque con minuto, título, qué, estado —vacío, borrador o listo— y lo que falta, que al tocarlo despliega su contenido; la epifanía, la promesa firmada y las decisiones abiertas. Se repinta sola cuando editas ese JSON: para cambiar la masterclass edita el archivo, no la vista) · cohorte (la cohorte fundadora del Cerebro Artificial en vivo, sin captura manual: en «Venta» —hasta el mar 20 23:59— los cupos pagados de 10, lo cobrado según Polar con su desglose (IVA retenido, comisión de Polar y lo que le queda), las cuotas de 3 pagos que Polar ya tiene programadas y el indicador de cada suscripción, y cada persona agendada con su llamada (se presentó, no llegó, movida, cancelada), su «¿Entra?» con botón para responderlo, su pago y sus intentos fallidos con el motivo en español, y lo siguiente ordenado por dinero en juego; en «Entrega» —desde el kickoff del mié 21— cada fundador con su cerebro instalado, meta escrita, las cinco casillas de la Semana 1, su última actividad, si está atorado, sus próximos cobros y sus uno a uno con la grabación de Fathom. Cambia sola de modo por fecha y tiene interruptor. Lo que una fuente no responde dice «sin dato». No afirmes cifras de la venta sin abrirla) · explorador (el árbol de archivos del repo, como el lateral de VS Code: carpetas plegables, íconos por tipo y búsqueda por nombre; respeta .gitignore y nunca enseña node_modules, .git, .next ni credenciales; ${DUENO} toca un archivo y se abre en su pestaña de documento, el código en solo lectura con color. Es para que ${DUENO} vea y controle; para enseñarle UN archivo usa documento con su ruta).
La vista aparece ARRIBA de tu texto en el mismo mensaje (nace al llamar la herramienta, antes de que redactes): refiérete a ella como «arriba» y deja tu pregunta o decisión para el final del texto. Úsala cuando ver el dato ahorra una explicación o un clic fuera del chat: «muéstrame mi mes», «cómo vamos», al planificar un periodo, o para enseñar un plan que acabas de componer. No la uses en cada respuesta ni para decorar; una o dos vistas por turno bastan. Mostrar no escribe nada: crear/mover eventos sigue siendo mc-event.py y la confirmación de ${DUENO}. No afirmes cifras que no consultaste: la vista las pinta, tú no las ves.
Por defecto la vista vive en el chat. fijar:true la deja además fija en el panel derecho de Arbrain (pestaña arriba de Tareas): úsalo solo si ${DUENO} lo pide («fíjalo», «déjalo en el panel», «ábreme el calendario/lienzo») o si es algo que va a consultar mientras sigue la conversación. Él también puede fijarla con el botón «Fijar en el panel» de la vista.
Calendario y Lienzo son pestañas vivas del panel (una de cada una; también son secciones de la barra izquierda): con fijar:true las abres ahí y lo que muestres reemplaza lo que enseñaban. Dentro de la pestaña ${DUENO} cambia día/semana/mes y acerca, aleja y desplaza el lienzo. «Expandir» (en la pestaña o en la vista del chat) lo lleva a la sección completa de la barra izquierda en la misma fecha, página o zona, dentro de Arbrain: la pizarra para dibujar y anotar, el calendario que escribe por mc-event.py. Nunca lo mandes a sfcal, sfmap ni SFTerm: todo vive en Arbrain (las apps nativas quedan de respaldo). Los agentes y terminales viven en la pestaña Taller del panel.
pizarron (7 oct 2026): la pestaña donde enseñas conversando; paginaId = el id de una sesión (sin paginaId, la casa del pizarrón: sesiones y biblioteca). Para ENSEÑAR no uses mostrar: usa la herramienta pizarron, que abre la sesión, escribe los pasos y espera el acuse.
documento (3 oct 2026: un archivo como pestaña con nombre propio; ruta relativa al repo artificial-brain, ~/Developer/… o /tmp/…; titulo = el nombre de la pestaña, p. ej. «Post demo»): .md formateado con sus diagramas mermaid, .txt para leer, .html aislado con sus assets (pergaminos), .mmd/.mermaid como diagrama, imágenes y video (pausado y sin sonido). Nunca código: no lo enseñes. Se refresca sola si el archivo cambia, y en .md/.txt ${DUENO} puede editar y guardar (si tú lo cambiaste mientras él editaba, no se pisa). Un .md con frontmatter \`destino: feed-sfc\` (más \`imagen:\` y opcional \`categoria:\`) abre en «Así se verá»: el post como saldría en el feed de SaaS Factory (tarjeta del feed y post abierto); el título sale de \`titulo:\` o de la línea «**Título:** …», y el cuerpo, de lo que sigue al primer \`---\`. compararCon ("HEAD" o la ruta de otra versión) enseña los cambios marcados por palabras, para que ${DUENO} vea solo lo que peinaste. Para fijar un documento usa fijar:true; soltar:true con la misma ruta cierra su pestaña. VISOR ÚNICO (8 oct 2026; todo archivo se abre dentro de Arbrain, nunca en Finder, Preview, QuickTime ni el navegador; rutas válidas además: ~/Movies, ~/Desktop, ~/Downloads, ~/Documents, ~/Pictures y ~/Music): .pdf (páginas, zoom, búsqueda, texto seleccionable que ${DUENO} te pregunta con su página); video (fotograma a fotograma, velocidad, J/K/L, pantalla completa; compararCon = ruta de OTRA versión del mismo video para verlas lado a lado o alternando, versiones = lista de hasta 6 rutas para 3 o más; tiempo = segundo en el que abre; ${DUENO} marca un instante y escribe «quita esto» y a ti te llega un mensaje «⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/v2.mp4» con su comentario: ese tiempo es de la línea de tiempo de ESA versión, no del material original); audio (forma de onda y los mismos marcadores); imagen (galería de su carpeta y compararCon para deslizar entre dos); y una CARPETA como ruta se abre como entrega: finales primero, luego piezas (usa entrega.json de la carpeta si existe: {titulo, finales:[…], piezas:[…], nota}; si no, deduce por nombre).
Pestañas del panel (3 oct 2026): ${DUENO} las acomoda arrastrando y cierra cualquiera. fijar, soltar y guardar esperan el ACUSE de su app y responden con el panel real; soltar cierra toda pestaña de esa vista o ruta, la haya abierto él o tú. Si la respuesta dice «NO confirmado» (app desconectada o sin responder), no afirmes que quedó hecho. Para ver qué tiene abierto de verdad usa la herramienta panel {accion:"listar"}. Lo que fijas tú y él no guarda se cierra solo al cambiar de conversación (menos la que esté viendo): fija con libertad, sin tope. guardar:true la manda al ARCHIVERO («+ › Guardadas»: sobrevive a cerrar pestañas y conversaciones; un documento de /tmp se copia a docs/guardados/ y la entrada apunta a la copia); úsalo solo si ${DUENO} pide guardarla. Con fijar:true además queda abierta y marcada como guardada. Para listar, reabrir o sacar lo guardado usa la herramienta archivero.
TELÉFONO (14 oct 2026): las pestañas del panel son UNAS para todos los aparatos de ${DUENO} (el Studio las guarda; escritorio y teléfono se sincronizan en segundos). Cuando pida «ábrelo en mi teléfono» (o «mándamelo al cel») usa mostrar con telefono:true y la vista que quiere (para algo que ya está en el panel, saca su vista, ruta o paginaId de panel {accion:"listar"}): queda fija en el panel y le llega un push; al tocarlo se abre en /telefono, el panel a pantalla completa. Cada vista tiene además su enlace propio, /artefacto?v=…, que solo abre con su sesión.
zona (solo lienzo) ENCUADRA la parte que quieres que lea, a ancho de panel: id de un marco o elemento (p. ej. tb:whole), prefijo de ids de una zona (ht:op, ht:cj), rectángulo «x,y,ancho,alto» o una frase que aparezca en el lienzo. Sin zona un lienzo grande se ve como miniatura ilegible. Las zonas de una página: \`python3 .claude/skills/sfmap/scripts/notas.py zonas --page <id>\`. Lo que ${DUENO} anotó a mano en el lienzo (firmado autor humano, con fecha): \`notas.py notas --page <id> [--desde YYYY-MM-DD]\`; léelo cuando diga «te dejé notas en el lienzo».`

export const PIZARRON_DESCRIPTION = `El pizarrón de Arbrain (7 oct 2026): una pestaña del panel donde ENSEÑAS conversando: tu voz (sincronizada palabra por palabra con lo que trazas), objetos vivos que ${DUENO} toca, predicciones antes de ver y lo entendido escrito de vuelta. Úsalo cuando ${DUENO} quiera aprender o entender algo («enséñame», «explícame», «quiero entender», «no me queda claro»), de cualquier tema que sepas (matemáticas, física, historia, biología, su negocio, su producto) o para recorrer un documento o pergamino conversando en vez de leerlo. No es para cifras del negocio ni para mapas de sistemas (eso es mostrar o lienzo).
Flujo: 1) accion:"abrir" {tema, documento?} → abre la pestaña en su panel (espera el acuse de su app) y te devuelve el OFICIO (léelo entero la primera vez en cada conversación: la gramática de acotaciones [[…]], el API de los objetos y cómo se enseña aquí), lo que ya domina del tema y la biblioteca. 2) accion:"pasos" {sesion, pasos:[…]} → cada paso pone elementos (objeto | texto | imagen | hilo), dice algo con acotaciones que caen en la palabra exacta y puede congelar la escena para que ${DUENO} prediga (predice). Suena en ~1 s; la respuesta te dice cuántos segundos de voz quedan en cola: úsalos para fabricar lo siguiente. 3) accion:"objeto" {id, nombre, ensena, codigo} fabrica un objeto vivo (JS: export default function montar(pz) {…}); se ensaya en seco y, si truena, te llega el error antes que a ${DUENO}; queda en la biblioteca para cualquier tema. Busca primero con accion:"biblioteca" {buscar}. 4) accion:"imagen" {sesion, id, prompt, luz} genera una lámina Sunburst (20-60 s: pídela ANTES de necesitarla). 5) Cuando ${DUENO} predice o te habla desde el pizarrón te llega un mensaje «✎ Pizarrón …»: accion:"leer" {sesion} te da qué movió, qué predijo y la FOTO de su trazo; responde con más pasos (la verdad junto a su lápiz, sin maquillar la diferencia). 6) Al cerrar: accion:"escribir" {sesion, entendido[], palabras (las suyas, textuales), domina[], fragil[], siguiente} → queda en el documento y en su mapa, y su lápiz se vuelve tinta.
En el chat escribe poco: la explicación vive en el pizarrón; no repitas en texto lo que dice la voz. Una o dos líneas y, si toca, tu pregunta.`

export const ATENDER_DESCRIPTION = `Marca como leídos avisos de la campana cuando ${DUENO} ya los vio o ya los conversaron (ids que te llegaron en «LO QUE LLEGÓ» o en la vista reporte). todos:true = todos los sin leer; úsalo solo si él lo pide. No borra nada: solo quita el pendiente.`
export const DELEGAR_DESCRIPTION = `Lanza un subagente en el Studio, en su propia carpeta (cwd bajo /tmp o ~/Developer), con el CLI que elijas en su modo SIN PANTALLA: harness claude, codex, opencode, gemini o qwen (agnóstico al proveedor: opencode acepta modelo «proveedor/modelo», p. ej. openrouter/~deepseek/deepseek-v4-flash-latest u openrouter/~openai/gpt-latest; qwen va por OpenRouter). Corre como proceso propio, desacoplado del servidor: sobrevive a cerrar la app y a reiniciar el agent-server. El encargo viaja como argumento del CLI (nada que teclear ni pantalla que leer) y no existen diálogos: no hay «¿Arranco?» ni permisos que aprobar. Termina cuando su proceso sale: el servidor te despierta en ESTA conversación con su última respuesta (o el error y el código de salida); si cerró con una pregunta, es para ti (contesta con retomar), no para ${DUENO}. Si cwd queda fuera del repo, el encargo lleva la ruta de las skills del proyecto. Nace sin aprobaciones (bypass, decisión de ${DUENO}), así que el encargo debe ser acotado y claro. ${DUENO_M} lo ve con la vista «trabajos» (muéstrala después de delegar, con agenteId): su conversación, estado y tokens. Hay tope visible de subagentes trabajando en paralelo y de tokens por día; si se alcanza, la herramienta lo dice: cierra uno o pregunta a ${DUENO}, no insistas. Úsalo para trabajo largo o paralelo que no debe bloquear esta conversación. Si el encargo edita código, crea antes su cwd con «${REPO_TXT}/arbrain/server/scripts/worktrees/wt.sh nuevo <nombre>» (copia rala de ~300 MB con node_modules enlazado, nunca «git worktree add» a mano); al cerrarlo, su worktree se quita solo si quedó limpio y en main. Pide confirmación antes si el encargo escribe fuera de /tmp o toca algo de ${DUENO}. Devuelve el agenteId. (Con CABINA_DELEGAR_MODO=pantalla vuelve el camino viejo: solo claude/codex en una PTY del motor.)`
export const RETOMAR_DESCRIPTION = `Le manda un mensaje de seguimiento a un subagente que TÚ lanzaste (agenteId). Sin pantalla: si terminó su turno, el mensaje abre un turno nuevo sobre la MISMA sesión (reanudar). Si sigue trabajando y su harness tiene entrada en vivo (claude y codex), el mensaje entra AL TURNO EN CURSO: lo toma en cuanto termine el paso que está haciendo, sin interrumpirlo, como cuando escribes en la terminal; en los demás harness queda ENCOLADO y se le entrega en cuanto su proceso salga. Para cortar lo que está haciendo usa detener. Si dejó una pregunta abierta, respóndela tú: es tuya, no de ${DUENO}; si necesita a ${DUENO}, pregúntasela en el chat y luego contesta con retomar; si no la atiendes en unos minutos, sube sola a ${DUENO} como «Espera tu decisión». (Subagentes viejos de pantalla: si está detenido en un DIÁLOGO con opciones numeradas, manda solo el número.) Las terminales de ${DUENO} no se operan desde aquí.`
export const DETENER_DESCRIPTION = `Corta el paso en curso de un subagente sin pantalla que TÚ lanzaste (agenteId) SIN cerrarlo ni perder su sesión: claude y codex reciben la interrupción de su protocolo (como Esc en la terminal); los demás, una señal de interrupción. Después queda quieto y el siguiente retomar lo reanuda con su contexto (p. ej. «detente, eso no; mejor haz X» = detener + retomar). No te despierta con un aviso por ese turno (lo pediste tú) y descarta los mensajes en cola (te los devuelve). Para terminar del todo usa cerrar.`
export const INTERACTIVO_DESCRIPTION = `Abre la sesión de un subagente sin pantalla que TÚ lanzaste (agenteId) en una terminal del motor, con su CLI interactivo de siempre (claude --resume, codex resume, opencode -s, gemini -r, qwen -r), para que ${DUENO} se meta a mano desde el Taller. Solo si no está trabajando. Mientras esa terminal viva, retomar no le escribe encima. Úsalo cuando ${DUENO} lo pida («ábremelo», «quiero hablar con él»). Devuelve el número de la terminal.`
export const CERRAR_DESCRIPTION = `Cierra (mata) un subagente que TÚ lanzaste cuando terminó o ${DUENO} lo pide; libera su lugar en el tope de paralelo y registra los tokens que gastó. Nunca cierra terminales de ${DUENO}. Su conversación queda en disco (el lector la sigue encontrando).`

export const ABRIR_DESCRIPTION = `Lleva a ${DUENO} a la SECCIÓN completa de Arbrain (barra izquierda) cuando la vista dentro del chat o del panel se queda corta o él lo pide («llévame al calendario», «ábreme Claridad en grande»). Todo pasa dentro de Arbrain: la barra, las conversaciones y el panel siguen a la mano y vuelve al chat con un clic. Al terminar tu respuesta la app navega sola (con opción de cancelar); en una conversación recargada queda como enlace, nunca navega por su cuenta.
Destinos: calendario (alcance dia|semana|mes + fecha; la sección también tiene Año, Agenda y Rutinas) · objetivos / hoy (alcance + fecha) · centro (abre Finanzas · Lo que entra) · contenido · lienzo (sección Lienzo: paginaId y zona opcional, la misma gramática que en mostrar; sin paginaId abre el último lienzo usado) · rutinas · finanzas. sfcal y sfmap son nombres viejos: llevan a Calendario y Lienzo dentro de Arbrain (las apps nativas siguen instaladas como respaldo, pero no se abren desde aquí). Úsala como máximo una vez por turno.`

const DATE = /^\d{4}-\d{2}-\d{2}$/
const PAGE = /^[A-Za-z0-9_-]{1,100}$/

function validDate(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || !DATE.test(value)) throw new Error('fecha debe ser YYYY-MM-DD.')
  const d = new Date(value + 'T12:00:00Z')
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error('fecha no existe en el calendario.')
  return value
}
function validPage(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || !PAGE.test(value)) throw new Error('paginaId inválido.')
  return value
}
function validText(value: unknown, max: number): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Se esperaba texto.')
  return value.slice(0, max)
}
function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, required = false): T | undefined {
  if (value == null || value === '') { if (required) throw new Error(`${field} es obligatorio (${options.join('|')}).`); return undefined }
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) throw new Error(`${field} debe ser ${options.join('|')}.`)
  return value as T
}

export function parseMostrar(raw: unknown): MostrarInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const vista = oneOf(o.vista, vistasEdicion(), 'vista', true)!
  const input: MostrarInput = { vista, alcance: oneOf(o.alcance, ALCANCES, 'alcance'), fecha: validDate(o.fecha), paginaId: validPage(o.paginaId), titulo: validText(o.titulo, 120), enfoque: validText(o.enfoque, 280) }
  if (vista === 'lienzo' && !input.paginaId) throw new Error('La vista lienzo necesita paginaId (la página de canvas que quieres mostrar).')
  if (o.zona != null && o.zona !== '') {
    if (vista !== 'lienzo') throw new Error('zona solo aplica a la vista lienzo.')
    input.zona = validText(o.zona, 120)!.trim()
  }
  if (vista === 'negocio') input.seccion = oneOf(o.seccion, SECCIONES_NEGOCIO, 'seccion')
  if (o.quien != null) {
    if (vista !== 'diario') throw new Error('quien solo aplica a la vista diario.')
    input.quien = oneOf(o.quien, QUIENES, 'quien')
  }
  if (vista === 'trabajos' && o.agenteId != null) {
    if (!Number.isInteger(o.agenteId) || (o.agenteId as number) < 0) throw new Error('agenteId debe ser el número de terminal.')
    input.agenteId = o.agenteId as number
  }
  if (vista === 'documento') {
    if (typeof o.ruta !== 'string' || !o.ruta.trim()) throw new Error('La vista documento necesita ruta (relativa al repo, ~/Developer/… o /tmp/…).')
    const doc = validarDocumento(o.ruta)
    if ('error' in doc) throw new Error(doc.error)
    input.ruta = o.ruta.trim()
    const medio = doc.tipo === 'video' || doc.tipo === 'imagen'
    if (o.compararCon != null && o.compararCon !== '') {
      if (typeof o.compararCon !== 'string') throw new Error('compararCon debe ser "HEAD" o una ruta.')
      const otra = o.compararCon.trim()
      if (doc.tipo === 'md' || doc.tipo === 'txt') {
        if (otra !== 'HEAD') { const v = validarDocumento(otra); if ('error' in v) throw new Error(`compararCon: ${v.error}`) }
      } else if (medio) {
        // Video o imagen: la otra versión debe ser del mismo tipo (se ven lado a lado o alternando).
        const v = validarDocumento(otra)
        if ('error' in v) throw new Error(`compararCon: ${v.error}`)
        if (v.tipo !== doc.tipo) throw new Error(`compararCon: la otra versión debe ser ${doc.tipo}, no ${v.tipo}.`)
      } else throw new Error('compararCon solo aplica a .md/.txt (cambios marcados), video e imagen (versiones lado a lado).')
      input.compararCon = otra
    }
    if (o.versiones != null) {
      if (!medio) throw new Error('versiones solo aplica a video e imagen.')
      if (!Array.isArray(o.versiones) || o.versiones.length > 6 || o.versiones.some(x => typeof x !== 'string')) throw new Error('versiones debe ser una lista de hasta 6 rutas.')
      const lista = (o.versiones as string[]).map(x => x.trim()).filter(Boolean)
      for (const x of lista) { const v = validarDocumento(x); if ('error' in v) throw new Error(`versiones: ${v.error}`); if (v.tipo !== doc.tipo) throw new Error(`versiones: «${x}» debe ser ${doc.tipo}, no ${v.tipo}.`) }
      if (lista.length) input.versiones = lista
    }
    if (o.tiempo != null) {
      if (doc.tipo !== 'video' && doc.tipo !== 'audio') throw new Error('tiempo solo aplica a video y audio.')
      if (typeof o.tiempo !== 'number' || !Number.isFinite(o.tiempo) || o.tiempo < 0 || o.tiempo > 86_400) throw new Error('tiempo debe ser segundos desde el inicio (número ≥ 0).')
      input.tiempo = Math.round(o.tiempo * 1000) / 1000
    }
  } else if (o.ruta != null || o.compararCon != null || o.versiones != null || o.tiempo != null) throw new Error('ruta, compararCon, versiones y tiempo solo aplican a la vista documento.')
  if (o.fijar != null && typeof o.fijar !== 'boolean') throw new Error('fijar debe ser true o false.')
  if (o.fijar === true) input.fijar = true
  if (o.soltar != null && typeof o.soltar !== 'boolean') throw new Error('soltar debe ser true o false.')
  if (o.soltar === true) { if (input.fijar) throw new Error('fijar y soltar a la vez no tiene sentido.'); input.soltar = true }
  if (o.pestana != null && o.pestana !== '') {
    if (o.soltar !== true) throw new Error('pestana solo aplica con soltar:true.')
    if (typeof o.pestana !== 'string' || o.pestana.length > 120) throw new Error('pestana debe ser el id que devuelve panel {accion:"listar"}.')
    input.pestana = o.pestana.trim()
  }
  // «Ábrelo en mi teléfono» (14 oct 2026): la fija en el panel (uno solo para todos sus aparatos) y le manda un push.
  if (o.telefono != null && typeof o.telefono !== 'boolean') throw new Error('telefono debe ser true o false.')
  if (o.telefono === true) {
    if (esEdicionCliente()) throw new Error('telefono no está disponible en esta edición.')
    if (input.soltar) throw new Error('telefono y soltar a la vez no tiene sentido.')
    input.telefono = true
    input.fijar = true
  }
  if (o.guardar != null && typeof o.guardar !== 'boolean') throw new Error('guardar debe ser true o false.')
  if (o.guardar === true) { if (input.soltar) throw new Error('guardar y soltar a la vez no tiene sentido: guardar ya la saca de la barra.'); input.guardar = true }
  return input
}

export function parseAbrir(raw: unknown): AbrirInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const destino = oneOf(o.destino, destinosEdicion(), 'destino', true)!
  const input: AbrirInput = { destino, alcance: oneOf(o.alcance, ALCANCES, 'alcance'), fecha: validDate(o.fecha), paginaId: validPage(o.paginaId), motivo: validText(o.motivo, 200) }
  if (o.zona != null && o.zona !== '') {
    if (destino !== 'lienzo' && destino !== 'sfmap') throw new Error('zona solo aplica al lienzo.')
    input.zona = validText(o.zona, 120)!.trim()
  }
  // Sin paginaId la sección Lienzo abre el último lienzo usado (3 oct 2026); la zona sí necesita página.
  if (input.zona && !input.paginaId) throw new Error('zona necesita paginaId.')
  return input
}

const LABEL: Record<string, string> = { pizarron: 'pizarrón', diario: 'reporte diario', documento: 'documento', reporte: 'reporte',  negocio: 'negocio', trabajos: 'trabajos', calendario: 'calendario', objetivos: 'objetivos', hoy: 'hoy', centro: 'finanzas · lo que entra', contenido: 'contenido', lienzo: 'lienzo', rutinas: 'rutinas', finanzas: 'finanzas', servidores: 'servidores', memoria: 'memoria y contexto', equipo: 'equipo', salud: 'salud', masterclass: 'masterclass', explorador: 'archivos', cohorte: 'cohorte', sfcal: 'calendario', sfmap: 'lienzo' }
const ALC: Record<Alcance, string> = { dia: 'día', semana: 'semana', mes: 'mes' }

/** Ejecuta un verbo de la cabina. Solo valida y confirma: la vista la monta el cliente. */
export function callCabina(tool: string, raw: unknown): { text: string; error?: boolean } {
  try {
    if (tool === 'mostrar') {
      const v = parseMostrar(raw)
      if (v.guardar) {
        const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
        const e = guardarEnArchivero(v as unknown as Record<string, unknown>, { conversacion })
        const copia = e.rutaOriginal ? ` Vivía en /tmp: se copió a ${e.input.ruta} y la entrada apunta a la copia.` : ''
        return { text: `«${e.nombre}» guardada en el archivero de ${DUENO} (${e.id}; «+ › Guardadas»).${copia} ${v.fijar ? 'Además quedó abierta como pestaña, marcada como guardada.' : 'No queda en la barra: se reabre desde Guardadas o con archivero {accion:"abrir"}.'}` }
      }
      if (v.vista === 'documento') {
        const nombre = v.titulo ? `«${v.titulo}» (${v.ruta})` : v.ruta
        if (v.soltar) return { text: `Pestaña del documento ${nombre} quitada del panel de ${DUENO} (si estaba fijada).` }
        return { text: `Documento ${nombre}${v.compararCon ? (/\.(md|markdown|txt)$/i.test(v.ruta ?? '') || v.compararCon === 'HEAD' ? ` con cambios marcados contra ${v.compararCon}` : ` comparado con ${v.compararCon}`) : ''}${v.versiones?.length ? ` (+${v.versiones.length} versiones)` : ''}${v.tiempo != null ? ` abierto en ${v.tiempo} s` : ''} mostrado a ${DUENO} ${v.fijar ? 'en la conversación y fijado como pestaña del panel' : 'en la conversación'}. Se refresca solo si el archivo cambia. Sigue tu respuesta; no repitas su contenido.` }
      }
      if (v.soltar) return { text: `Vista ${LABEL[v.vista]} quitada del panel de ${DUENO} (si estaba fijada).` }
      const detail = [v.alcance && ALC[v.alcance], v.fecha, v.paginaId && `página ${v.paginaId}`, v.zona && `zona «${v.zona}»`].filter(Boolean).join(', ')
      return { text: `Vista ${LABEL[v.vista]}${detail ? ` (${detail})` : ''} mostrada a ${DUENO} ${v.fijar ? 'en la conversación y fijada en el panel' : 'en la conversación'} con datos en vivo. No viste sus datos: si vas a citarlos, consúltalos por su fuente. Sigue tu respuesta; no repitas lo que la vista ya enseña.` }
    }
    if (tool === 'abrir') {
      const v = parseAbrir(raw)
      return { text: `Al terminar tu respuesta Arbrain llevará a ${DUENO} a ${LABEL[v.destino]}${v.fecha ? ` (${v.fecha})` : ''}; puede cancelarlo. Cierra tu respuesta sin esperar confirmación de la navegación.` }
    }
    throw new Error(`Herramienta desconocida: ${tool}`)
  } catch (error) {
    return { text: error instanceof Error ? error.message : 'Invocación inválida.', error: true }
  }
}

const alcanceSchema = { type: 'string', enum: [...ALCANCES], description: 'dia | semana | mes' }
const fechaSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Fecha ancla YYYY-MM-DD (zona America/Mexico_City). Ausente = hoy.' }
const paginaSchema = { type: 'string', description: 'page_id de la tabla draw (canvas v4).' }

export const ARCHIVERO_DESCRIPTION = `El archivero del panel derecho de ${DUENO} («+ › Guardadas»): pestañas que él (o tú, por pedido suyo, con mostrar guardar:true) guardó para reabrirlas luego. Vive en ~/.config/arbrain/archivero.json. accion: listar (id, nombre, vista, conversación de origen, fechas; abiertoEn sirve para proponer en la revisión del domingo lo no abierto en 30 días: nunca se borra solo) · abrir (id o nombre: la app la abre como pestaña en unos segundos) · sacar (id o nombre: la quita del archivero; no borra el archivo). Úsala cuando ${DUENO} diga «qué tengo guardado», «ábreme lo que guardé de X», «saca X de guardadas».`

export const PANEL_DESCRIPTION = `Las pestañas que ${DUENO} tiene abiertas AHORA en su panel derecho, tal como las reporta su app (no lo que tú creas haber fijado). accion: listar → por cliente conectado: id, nombre, vista, ruta o página, quién la abrió (Levy o ${DUENO}), si está guardada, a la vista y en qué ventana vive (siempre lo dice: «en el Panel principal» o «en la Ventana N», en otro monitor; ${DUENO} las arrastra entre ventanas como pestañas de Chrome). Cada cliente sale con su nombre completo (qué app, en qué aparato y de qué sesión) y dice si RECIBE lo que abras en esta conversación: lo que muestras o enseñas va SOLO al cliente que tiene abierta esta conversación (o donde ${DUENO} escribió último), nunca a otro cliente conectado ni a la sesión de otra persona; dentro de ese cliente cae en la ventana que ${DUENO} eligió en «Dónde abre Levy» (por defecto la de la izquierda) y el acuse de mostrar dice en cuál quedó. Úsala antes de afirmar qué ve ${DUENO} y para cerrar o verificar pestañas. Si no hay cliente conectado lo dice (error): entonces nada de lo que fijes, sueltes o guardes está confirmado. mostrar {fijar|soltar|guardar} ya espera el acuse de la app y responde con el panel real. accion: secciones (6 oct 2026) → el menú «+» de ${DUENO} y su orden: la MISMA configuración que él toca en Ajustes › Panel (~/.config/arbrain/panel-ajustes.json), difundida en vivo a todas sus ventanas. Sin más campos lista qué secciones muestra, en qué orden y cuáles están ocultas. Con ocultar:[…] (p. ej. ["Tareas"]), mostrar:[…], orden:[…] (lista completa o parcial: lo que nombras va primero, en ese orden, y lo demás detrás como estaba) o restablecer:true, escribe el cambio y ESPERA el acuse de cada app conectada: ocultar una sección también cierra su pestaña (Tareas, Taller o la vista). Las secciones son: calendario, tareas, lienzo, negocio, reporte (Lo que llegó), centro (Command center), equipo, salud, contenido, finanzas, explorador (Archivos), taller; acepta el nombre o el id. Si dice «NO confirmado», la config quedó escrita pero ninguna app la aplicó aún: no afirmes que ${DUENO} ya lo ve. Ocultar es reversible y no borra nada; úsalo solo si ${DUENO} lo pide («quítame Tareas del panel»). Equipo y «Lo que llegó» nacen ocultos del «+» (el organigrama vive en Ajustes › Panel › «Equipo y organigrama»; los reportes llegan al hilo Reportes y las rutinas están en Taller › Rutinas); con mostrar:["Equipo"] o mostrar:["Lo que llegó"] vuelven al «+». Ocultar solo quita la entrada del menú: mostrar {vista:"reporte"} o {vista:"equipo"} sigue funcionando cuando tú las abres a propósito.`

/** Texto de `despertador` para el dueño `quien` (igual en las dos ediciones). */
export const textoDespertador = (quien: string) => `Despertadores DURABLES de esta conversación: «despiértame en 5 min», «revisa cada hora», «a las 14:05 corre la QA». Al vencer, el servidor te escribe en ESTA conversación un mensaje con el texto que dejaste y retomas la sesión aunque el servidor se haya reiniciado o el proceso se haya retirado; ${quien} ve tu respuesta en vivo y un aviso de los despertadores pendientes. Úsalo en vez de CronCreate/ScheduleWakeup/loop (no están disponibles aquí). accion: crear (texto + UNA forma: enMinutos, aLas «HH:MM» hora de México o ISO con zona, o cadaMinutos ≥ 5 con veces opcional), listar, cancelar (id). El texto es para ti al despertar: escribe qué revisar y qué hacer, con rutas o ids. Topes: 10 pendientes por conversación, 8 días de horizonte, 48 repeticiones, 12 despertares por hora.`
export const DESPERTADOR_DESCRIPTION = textoDespertador(DUENO)

export const CABINA_TOOLS = [
  { name: 'mostrar', description: MOSTRAR_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['vista'], properties: {
    vista: { type: 'string', enum: [...VISTAS] }, alcance: alcanceSchema, fecha: fechaSchema, paginaId: paginaSchema,
    titulo: { type: 'string', maxLength: 120, description: 'Encabezado corto opcional (p. ej. «Octubre: lanzamiento»). En documento es el nombre de la pestaña («Post demo»).' },
    enfoque: { type: 'string', maxLength: 280, description: `Una línea opcional: qué debe mirar ${DUENO} en la vista.` },
    seccion: { type: 'string', enum: [...SECCIONES_NEGOCIO], description: 'Solo vista negocio: la tarjeta a enfocar.' },
    quien: { type: 'string', enum: [...QUIENES], description: `Solo vista diario: de quién es el reporte (${PERSONA_DUENO} por defecto${PERSONAS.length > 1 ? `; ${PERSONAS.slice(1).join(', ')} = el suyo` : ''}).` },
    agenteId: { type: 'integer', minimum: 0, description: 'Solo vista trabajos: la terminal/subagente a enfocar.' },
    fijar: { type: 'boolean', description: `Opcional, por defecto false: además de mostrarla en el chat, la fija en el panel derecho. Solo si ${DUENO} lo pide o la va a consultar mientras conversan.` },
    zona: { type: 'string', maxLength: 120, description: 'Solo vista lienzo: qué parte encuadrar para que se lea (id de marco o elemento, prefijo de ids como ht:op, «x,y,ancho,alto» o una frase del lienzo).' },
    ruta: { type: 'string', maxLength: 1000, description: 'Solo vista documento: el archivo (relativo al repo artificial-brain, ~/Developer/… o /tmp/…). .md, .txt, .html, .mmd, imagen o video; nunca código.' },
    compararCon: { type: 'string', maxLength: 1000, description: 'Solo vista documento. En .md/.txt: "HEAD" (la versión del último commit) o la ruta de otra versión; enseña los cambios marcados por palabras. En video o imagen: la ruta de otra versión del mismo tipo; se ven lado a lado o alternando.' },
    versiones: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 1000 }, description: 'Solo documento de video o imagen: más versiones (v1, v2, v3…) para comparar o alternar, además de ruta y compararCon.' },
    tiempo: { type: 'number', minimum: 0, description: `Solo documento de video o audio: segundo en el que abre (p. ej. 130.4 para llevar a ${DUENO} al instante que corriges).` },
    soltar: { type: 'boolean', description: `Cierra en el panel SOLO las pestañas que coinciden con esta vista y su ruta (documento) o paginaId (lienzo), la haya abierto ${DUENO} o tú; nunca las demás. Si no hay coincidencia no toca nada y lo dice. Responde con lo que la app confirmó. Úsalo cuando ya no haga falta tenerla a la vista.` },
    pestana: { type: 'string', maxLength: 120, description: 'Solo con soltar:true: el id de UNA pestaña, tal como lo devuelve panel {accion:"listar"} (junto con su vista). Cierra solo esa; si no existe no toca nada.' },
    guardar: { type: 'boolean', description: `La guarda en el archivero («+ › Guardadas»). Solo si ${DUENO} pide guardarla. Un documento de /tmp se copia a docs/guardados/.` },
    telefono: { type: 'boolean', description: `«Ábrelo en mi teléfono», «mándamelo al cel», «quiero verlo en el iPhone»: la fija en su panel (implica fijar:true; el panel es UNO para escritorio y teléfono) y le manda un push a sus iPhone; al tocarlo se abre a pantalla completa en /telefono. titulo = el nombre del aviso; enfoque = su texto. Solo si ${DUENO} lo pide.` },
  } } },
  { name: 'pizarron', description: PIZARRON_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['accion'], properties: {
    accion: { type: 'string', enum: ['abrir', 'pasos', 'objeto', 'imagen', 'leer', 'escribir', 'biblioteca'] },
    sesion: { type: 'string', maxLength: 100, description: 'El id de la sesión (lo devuelve abrir). En abrir, para retomar una anterior.' },
    tema: { type: 'string', maxLength: 120, description: `abrir: qué va a aprender, en palabras de ${DUENO} («Derivadas», «El regulador»).` },
    alumno: { type: 'string', maxLength: 30, description: `abrir: quién aprende (${PERSONA_DUENO} por defecto). En PRUEBAS siempre "prueba": nunca se escribe en el mapa de ${DUENO} con predicciones simuladas.` },
    documento: { type: 'string', maxLength: 1000, description: 'abrir: el documento que la sesión recorre (relativo al repo, ~/Developer/… o absoluto). Ahí se escribe de vuelta lo entendido.' },
    luz: { type: 'string', enum: ['papel', 'noche'], description: 'abrir: la luz inicial (papel enseña, noche se siente). imagen: el estilo (papel = grabado claro didáctico con rótulos; noche = grabado oscuro sin texto).' },
    pasos: { type: 'array', maxItems: 24, items: { type: 'object' }, description: 'pasos: [{id?, pon?:[elemento…], quita?:[id…], voz?:"texto con [[acotaciones]]", predice?:{pregunta, modo:arrastra|dibuja|numero|palabras, en?, pista?, revela?:"voz tras la respuesta", respuesta?}, luz?, camara?:false}]. Elemento: {id, tipo:"objeto", objeto, params?, ancho?, alto?, titulo?} | {id, tipo:"texto", texto, estilo?:grande|titulo|nota|formula} | {id, tipo:"imagen", imagen, ancho?, pie?} | {id, tipo:"hilo", de:"obj.param", a:"obj.param", f?:"expresión en x"}; con junto/lado/lugar/oculto opcionales. Gramática completa en el OFICIO.' },
    id: { type: 'string', maxLength: 60, description: 'objeto: id en la biblioteca (minúsculas y guiones). imagen: id de la imagen en la sesión.' },
    nombre: { type: 'string', maxLength: 80, description: 'objeto: nombre corto.' },
    ensena: { type: 'string', maxLength: 300, description: 'objeto: qué enseña, en una frase (así se encuentra después).' },
    codigo: { type: 'string', maxLength: 60000, description: 'objeto: export default function montar(pz) { … } (API en el OFICIO).' },
    temas: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'objeto: temas donde sirve (para encontrarlo después).' },
    ancho: { type: 'number', description: 'objeto: ancho por defecto en pixeles del pizarrón (560 si no).' },
    alto: { type: 'number', description: 'objeto: alto por defecto (360 si no).' },
    eventos: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'objeto: eventos que emite con pz.emitir (para [[espera obj.evento]]).' },
    prompt: { type: 'string', maxLength: 2000, description: 'imagen: la escena concreta: objetos, relación y rótulos exactos si los hay.' },
    aspecto: { type: 'string', enum: ['16:9', '4:3', '1:1', '3:4'], description: 'imagen: proporción (16:9 por defecto).' },
    entendido: { type: 'array', items: { type: 'string' }, maxItems: 12, description: `escribir: lo que ${DUENO} entendió, en su marco.` },
    palabras: { type: 'string', maxLength: 1200, description: 'escribir: cómo lo dijo él, textual.' },
    domina: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'escribir: lo que ya domina (su mapa).' },
    fragil: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'escribir: lo que todavía está frágil.' },
    siguiente: { type: 'string', maxLength: 300, description: 'escribir: el siguiente paso que le toca.' },
    buscar: { type: 'string', maxLength: 120, description: 'biblioteca: palabras para filtrar.' },
    todo: { type: 'boolean', description: 'leer: todo desde el principio, no solo lo nuevo.' },
  } } },
  { name: 'archivero', description: ARCHIVERO_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['accion'], properties: {
    accion: { type: 'string', enum: ['listar', 'abrir', 'sacar'] },
    id: { type: 'string', maxLength: 200, description: 'abrir/sacar: id de la entrada (g-xxxxxxxx) o su nombre.' },
  } } },
  { name: 'panel', description: PANEL_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['accion'], properties: {
    accion: { type: 'string', enum: ['listar', 'secciones'] },
    ocultar: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 12, description: 'Solo secciones: nombres o ids de las secciones del «+» que dejan de salir (su pestaña se cierra).' },
    mostrar: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 12, description: 'Solo secciones: las que vuelven a salir en el «+».' },
    orden: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 12, description: 'Solo secciones: el orden del «+»: lo que nombras va primero y lo demás detrás, como estaba.' },
    restablecer: { type: 'boolean', description: 'Solo secciones: orden de fábrica con Equipo y Lo que llegó ocultos (y «Dónde abre Levy» en la izquierda).' },
    donde: { type: 'string', enum: ['izquierda', 'derecha', 'principal'], description: `Solo secciones: «Dónde abre Levy» (Ajustes › Panel). La ventana de Arbrain que recibe lo que abres con mostrar o pizarron: la que esté a la izquierda de la pantalla (por defecto), la de la derecha o siempre el panel principal. Solo si ${DUENO} lo pide.` },
  } } },
  { name: 'abrir', description: ABRIR_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['destino'], properties: {
    destino: { type: 'string', enum: [...DESTINOS] }, alcance: alcanceSchema, fecha: fechaSchema, paginaId: paginaSchema,
    zona: { type: 'string', maxLength: 120, description: 'Solo lienzo: qué parte encuadrar al abrir la sección (misma gramática que en mostrar).' },
    motivo: { type: 'string', maxLength: 200, description: 'Por qué lo llevas ahí, en pocas palabras.' },
  } } },
  { name: 'despertador', description: DESPERTADOR_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['accion'], properties: {
    accion: { type: 'string', enum: ['crear', 'listar', 'cancelar'] },
    texto: { type: 'string', description: `crear: qué debes hacer al despertar (para ti, no para ${DUENO}).` },
    enMinutos: { type: 'number', description: 'crear: minutos desde ahora.' },
    aLas: { type: 'string', description: 'crear: «HH:MM» (24 h, hora de México; si ya pasó hoy, mañana) o ISO con zona.' },
    cadaMinutos: { type: 'number', description: 'crear: repetir cada N minutos (mínimo 5). Sin enMinutos/aLas, el primero es en N minutos.' },
    veces: { type: 'number', description: 'crear con cadaMinutos: cuántas veces en total (máximo 48).' },
    id: { type: 'string', description: 'cancelar: id del despertador (d-xxxxxxxx).' },
  } } },
  { name: 'atender', description: ATENDER_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, properties: {
    ids: { type: 'array', items: { type: 'string' }, maxItems: 50, description: 'ids de avisos a marcar leídos.' }, todos: { type: 'boolean' },
  } } },
  { name: 'delegar', description: DELEGAR_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['nombre', 'harness', 'encargo', 'cwd'], properties: {
    nombre: { type: 'string', maxLength: 80 }, harness: { type: 'string', enum: ['claude', 'codex', 'opencode', 'gemini', 'qwen'], description: 'El CLI del subagente. claude por defecto; opencode para cualquier proveedor (modelo proveedor/modelo).' },
    encargo: { type: 'string', maxLength: 2000, description: 'El prompt completo del subagente.' },
    cwd: { type: 'string', description: 'Carpeta de trabajo (bajo /tmp o ~/Developer). Para pruebas: /tmp/<algo>.' },
    modelo: { type: 'string', description: 'Opcional. Defaults: claude → claude-sonnet-5-5 (regla de la casa); codex → el de su config (o CABINA_MODELO_CODEX); opencode → openrouter/~deepseek/deepseek-v4-flash-latest (formato proveedor/modelo); gemini → gemini-2.5-flash; qwen → qwen/qwen3-coder. Pide otro solo si el encargo lo justifica.' },
  } } },
  { name: 'retomar', description: RETOMAR_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['agenteId', 'texto'], properties: {
    agenteId: { type: 'integer', minimum: 0 }, texto: { type: 'string', maxLength: 4000 },
  } } },
  { name: 'detener', description: DETENER_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['agenteId'], properties: {
    agenteId: { type: 'integer', minimum: 0 },
  } } },
  { name: 'interactivo', description: INTERACTIVO_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['agenteId'], properties: {
    agenteId: { type: 'integer', minimum: 0 },
  } } },
  { name: 'cerrar', description: CERRAR_DESCRIPTION, inputSchema: { type: 'object', additionalProperties: false, required: ['agenteId'], properties: {
    agenteId: { type: 'integer', minimum: 0 },
  } } },
] as const

/** Verbos con efecto (async): atender, delegar, retomar, cerrar. mostrar/abrir se validan en callCabina. */
export async function ejecutarCabina(tool: string, raw: unknown): Promise<{ text: string; error?: boolean; imagenes?: { data: string; mimeType: string }[] }> {
  // Red team A1: en la edición cliente no hay subagentes (procesos de CLI aparte, fuera de la guardia y de I8).
  if (esEdicionCliente() && CABINA_SUBAGENTES.has(tool)) return { text: MENSAJE_SIN_SUBAGENTES, error: true }
  // Carril T: la campana (avisos de la instalación original) no existe en cliente.
  // Carril U: el pizarrón tampoco existe en cliente.
  if (esEdicionCliente() && CABINA_SOLO_ORIGINAL.has(tool)) return { text: motivoSoloOriginal(tool), error: true }
  if (tool === 'mostrar') return mostrarConEfecto(raw)
  if (tool === 'abrir') return callCabina(tool, raw)
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  try {
    if (tool === 'despertador') return await despertador(o)
    if (tool === 'pizarron') return await pizarronTool(o)
    if (tool === 'archivero') return archivero(o)
    if (tool === 'panel') return await panel(o)
    if (tool === 'atender') {
      const { atender } = await import('./llegado.js')
      const n = await atender({ ids: Array.isArray(o.ids) ? o.ids.map(String) : undefined, todos: o.todos === true })
      return { text: n ? `${n} aviso(s) marcados como leídos en la campana.` : 'No había avisos sin leer con esos ids.' }
    }
    const { delegar, retomar, cerrar, harnessPermitidos } = await import('./cuerpo.js')
    if (tool === 'delegar') {
      const permitidos = await harnessPermitidos()
      const harness = typeof o.harness === 'string' && permitidos.includes(o.harness) ? o.harness : null
      if (!harness || typeof o.encargo !== 'string' || !o.encargo.trim() || typeof o.cwd !== 'string' || typeof o.nombre !== 'string') throw new Error(`delegar necesita nombre, harness (${permitidos.join('|')}), encargo y cwd.`)
      const origen = (() => { try { return scopeDeCabina() } catch { return undefined } })()
      const sub = await delegar({ nombre: o.nombre, harness, encargo: o.encargo, cwd: o.cwd, modelo: typeof o.modelo === 'string' && o.modelo ? o.modelo : undefined, ...(origen ? { avisarA: origen } : {}) })
      const entrega = sub.entrega === 'entregado' ? 'El encargo ya le llegó.' : sub.entrega === 'falló' ? `El encargo NO se confirmó (${sub.entregaNota}); el subagente es tuyo: entrégalo con retomar.` : `El CLI sigue arrancando; la entrega se reintenta sola (${sub.entregaNota ?? 'en curso'}). Si en un minuto no trabaja, usa retomar.`
      if (sub.modo === 'sin-pantalla') return { text: `Subagente «${sub.nombre}» lanzado sin pantalla (proceso propio, sobrevive a reinicios): agenteId ${sub.id} (${sub.harness}${sub.modelo ? ` · ${sub.modelo}` : ''}, permisos ${sub.permisos === 'bypass' ? 'bypassPermissions' : sub.permisos}, ${sub.cwd}). El encargo ya le llegó como argumento del CLI. ${sub.aviso ? `Aviso: ${sub.aviso}. ` : ''}Muéstralo con mostrar {vista:"trabajos", agenteId:${sub.id}}. ${origen ? 'Cuando su proceso salga (terminó, falló o hizo una pregunta), el servidor te despierta en ESTA conversación con su última respuesta: no necesitas despertador ni vigía para eso. ' : ''}Para seguir la conversación usa retomar; ciérralo con cerrar cuando termine.` }
      return { text: `Subagente «${sub.nombre}» lanzado en ${sub.motor ? 'el motor de Arbrain' : 'SFTerm (motor apagado: respaldo por el gate)'}: agenteId ${sub.id} (${sub.harness}${sub.modelo ? ` · ${sub.modelo}` : ''}, permisos ${sub.permisos === 'bypass' ? 'bypassPermissions' : sub.permisos}, ${sub.cwd}). ${entrega} ${sub.aviso ? `Aviso: ${sub.aviso}. ` : ''}${sub.espera ? `Dejó una pregunta abierta, es tuya (no de ${DUENO}): «${sub.espera}»; respóndela con retomar. ` : ''}Muéstralo con mostrar {vista:"trabajos", agenteId:${sub.id}}. ${origen && sub.motor ? 'Cuando termine (quieto tras responder, o si su proceso muere), el servidor te despierta en ESTA conversación con su última respuesta: no necesitas despertador ni vigía para eso. ' : ''}Ciérralo con cerrar cuando termine.` }
    }
    const id = Number(o.agenteId)
    if (!Number.isInteger(id)) throw new Error('agenteId inválido.')
    if (tool === 'retomar') { if (typeof o.texto !== 'string' || !o.texto.trim()) throw new Error('retomar necesita texto.'); const r = await retomar(id, o.texto); if (r.eligio) return { text: r.confirmado ? `Opción ${r.eligio} elegida en el diálogo del subagente ${id}; ya siguió.` : `Marqué la opción ${r.eligio} en el diálogo del subagente ${id}, pero el diálogo sigue en pantalla: míralo con mostrar trabajos.` }; if (r.enVivo) return { text: `Mensaje entregado EN VIVO al subagente ${id}: entró a su turno en curso y lo toma en cuanto termine el paso que está haciendo (no lo interrumpe). Te aviso cuando su proceso salga.` }; return { text: r.confirmado ? (r.encolado ? `Mensaje encolado en el subagente ${id}: seguía en medio de un paso y lo tomará al terminar (quedó en su cola).` : `Mensaje entregado al subagente ${id}.`) : `Mensaje enviado al subagente ${id}${r.encolado ? ' (seguía trabajando)' : ''}, pero no pude confirmar que quedara en su cola: míralo con mostrar trabajos antes de repetirlo.` } }
    if (tool === 'detener') {
      const { detenerSubagente } = await import('./sin-pantalla.js')
      const r = await detenerSubagente(id)
      if (!r.estaba) return { text: `El subagente ${id} no estaba trabajando: no había paso que cortar. Su última respuesta: «${r.respuesta.slice(0, 400) || '(sin respuesta)'}».` }
      const como = r.como === 'protocolo' ? 'con la interrupción de su protocolo' : r.como === 'señal' ? 'con una señal de interrupción' : 'a la fuerza (no respondió a la interrupción)'
      return { text: `Subagente ${id} detenido ${como}. Su sesión sigue: retomar lo reanuda con su contexto.${r.respuesta ? ` Lo último que dijo: «${r.respuesta.slice(0, 400)}».` : ''}${r.colaDescartada.length ? ` Mensajes en cola descartados: ${r.colaDescartada.map(x => `«${x.slice(0, 120)}»`).join(' · ')}.` : ''}` }
    }
    if (tool === 'interactivo') { const { abrirInteractivo } = await import('./sin-pantalla.js'); const r = await abrirInteractivo(id); return { text: `Sesión del subagente ${id} abierta a mano en la terminal ${r.terminal} del motor (${r.comando}). ${DUENO_M} la ve en el Taller; mientras viva, retomar no le escribe encima.` } }
    if (tool === 'cerrar') { await cerrar(id); return { text: `Subagente ${id} cerrado. Su conversación queda en disco.` } }
    throw new Error(`Herramienta desconocida: ${tool}`)
  } catch (error) {
    return { text: error instanceof Error ? error.message : 'No se pudo ejecutar.', error: true }
  }
}

/**
 * `pizarron` (7 oct 2026): enseñar conversando. abrir fija la pestaña con acuse de la app (como mostrar fijar); lo demás
 * escribe la sesión en el repo y la app la reproduce. Detalle en pizarron.ts y docs/pizarron/OFICIO.md.
 */
async function pizarronTool(o: Record<string, unknown>): Promise<{ text: string; error?: boolean; imagenes?: { data: string; mimeType: string }[] }> {
  const pz = await import('./pizarron.js')
  const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
  switch (o.accion) {
    case 'abrir': {
      const { sesion, nueva } = pz.abrirSesion(o, conversacion)
      // La pestaña nace en la ventana que muestra ESTA conversación (la app lee esta respuesta), no por el bus: el bus
      // llegaría a todas las ventanas de Daniel. Si no la tiene abierta, la sesión espera: sus pasos suenan al abrirla.
      const panel = `La pestaña «Pizarrón» se abre sola en la ventana donde ${DUENO} tiene esta conversación; con panel list puedes verificar que está. Si no la tiene a la vista, los pasos esperan y suenan cuando la abra (también desde «+ › Pizarrón»).`
      const vistos = sesion.pasos.length ? ` Ya tiene ${sesion.pasos.length} pasos (${pz.resumenPasos(sesion.pasos)}): sigue desde ahí.` : ''
      return { text: [`Sesión ${nueva ? 'nueva' : 'retomada'}: sesion="${sesion.id}" · «${sesion.tema}»${sesion.documento ? ` · documento ${sesion.documento}` : ''}.${vistos}`, panel, '', '── LO QUE YA DOMINA ──', pz.mapaDelAlumno(sesion.alumno, sesion.tema), '', '── BIBLIOTECA ──', pz.describirBiblioteca(), '', '── OFICIO ──', pz.oficio()].join('\n') }
    }
    case 'pasos': {
      const r = pz.agregarPasos(String(o.sesion ?? ''), o.pasos)
      return { text: `Guardé ${r.nuevos.length} paso(s) en «${r.sesion.tema}»: ${pz.resumenPasos(r.nuevos)}. Empiezan a sonar en su panel en ~1 s (si ya sonaba algo, al terminar). Voz nueva en cola: ~${r.segundos} s: es tu tiempo para preparar lo siguiente (objeto, imagen) sin que se note.${r.avisos.length ? `\nAvisos:\n- ${r.avisos.join('\n- ')}` : ''}` }
    }
    case 'objeto': {
      const r = pz.guardarObjeto(o)
      return { text: `Objeto «${r.ficha.id}» ${r.nuevo ? 'nuevo en' : 'actualizado en'} la biblioteca; el ensayo en seco pasó. Declaró params ${Object.keys(r.ficha.params ?? {}).join(', ') || '—'}; asas ${r.ficha.asas?.join(', ') || '—'}; anclas ${r.ficha.anclas?.join(', ') || '—'}; métodos ${r.ficha.metodos?.join(', ') || '—'}. Úsalo en un paso: {id:"…", tipo:"objeto", objeto:"${r.ficha.id}"}.${r.avisos.length ? `\nAvisos:\n- ${r.avisos.join('\n- ')}` : ''}` }
    }
    case 'imagen': return { text: await pz.generarImagen(o) }
    case 'leer': { const r = pz.leerAlumno(String(o.sesion ?? ''), { todo: o.todo === true }); return { text: r.text, ...(r.imagenes.length ? { imagenes: r.imagenes } : {}) } }
    case 'escribir': return { text: pz.escribirDeVuelta(o) }
    case 'biblioteca': return { text: pz.describirBiblioteca(typeof o.buscar === 'string' ? o.buscar : undefined) }
  }
  throw new Error('accion: abrir, pasos, objeto, imagen, leer, escribir o biblioteca.')
}

/**
 * `mostrar` con efecto sobre el panel (fijar, soltar, guardar): deja un comando para la app de Daniel y
 * confirma con SU acuse, el estado real de su panel, no con un éxito optimista. Sin cliente conectado lo dice.
 */
async function mostrarConEfecto(raw: unknown): Promise<{ text: string; error?: boolean }> {
  const base = callCabina('mostrar', raw)
  if (base.error) return base
  const v = parseMostrar(raw)
  if (!v.fijar && !v.soltar && !v.guardar) return base
  const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
  const accion = v.guardar ? 'guardar' : v.soltar ? 'soltar' : 'fijar'
  const { comando, objetivos, destino } = emitir(accion, { ...limpiarVista(v as unknown as Record<string, unknown>), ...(v.fijar ? { fijar: true } : {}), ...(v.pestana ? { pestana: v.pestana } : {}) }, conversacion)
  const r = informe(comando, objetivos, await esperarAcuses(comando.id, objetivos), Date.now(), undefined, destino)
  // «NO confirmado» (app dormida, sin acuse o que rechazó) es asunto técnico: Levy lo lee en el texto y queda en la bitácora del bus,
  // pero no es un error de herramienta, o el chat de Daniel lo pinta como aviso naranja (7 oct 2026).
  if (!r.confirmado) anotarBitacora({ evento: 'mostrar-sin-confirmar', accion, comando: comando.id, vista: v.vista, ruta: v.ruta, conectados: objetivos.length, detalle: r.text })
  if (v.telefono) {
    // El push sale aunque ninguna app haya acusado: el enlace abre la vista en el teléfono y la deja en el panel compartido.
    const { avisarAlTelefono } = await import('./telefono.js')
    const push = await avisarAlTelefono(limpiarVista(v as unknown as Record<string, unknown>) as unknown as Record<string, unknown>)
    if (!push.ok) anotarBitacora({ evento: 'telefono-sin-push', vista: v.vista, ruta: v.ruta, detalle: push.texto })
    const panelTxt = r.confirmado ? `En el panel: ${r.text}` : `El escritorio no la confirmó (${r.text}); al tocar el aviso el teléfono la abre y la deja en el panel compartido.`
    return { text: `${push.ok ? `Teléfono: ${push.texto}; al tocarlo abre ${push.url.split('?')[0]} con la vista al frente.` : `Teléfono: NO confirmado, ${push.texto}. No digas que ya le llegó.`} ${panelTxt}` }
  }
  if (accion === 'fijar') return { text: r.confirmado ? `${base.text} Confirmación de la app: ${r.text}` : r.text }
  if (accion === 'soltar') return { text: r.text }
  return { text: `${base.text} Panel: ${r.text}` }
}

/** Las pestañas que Daniel tiene abiertas AHORA, según lo que reporta su app; o la configuración del menú «+» (accion secciones). */
async function panel(o: Record<string, unknown>): Promise<{ text: string; error?: boolean }> {
  if (o.accion === 'secciones') return seccionesDelPanel(o)
  if (o.accion !== 'listar') throw new Error('accion debe ser listar o secciones.')
  const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
  const r = describirPanel(Date.now(), undefined, conversacion)
  return { text: r.text, ...(r.conectado ? {} : { error: true }) }
}

/**
 * `panel {accion:"secciones"}` (6 oct 2026): lee o escribe la config del menú «+» (la misma que Ajustes › Panel) y, si escribe,
 * espera a que cada app conectada la reporte aplicada en su latido. Sin cliente conectado la config queda escrita y lo dice.
 */
async function seccionesDelPanel(o: Record<string, unknown>): Promise<{ text: string; error?: boolean }> {
  const lista = (v: unknown, campo: string) => { if (v === undefined) return undefined; if (!Array.isArray(v)) throw new Error(`${campo} debe ser una lista de secciones (${(esEdicionCliente() ? SECCIONES_PANEL_CLIENTE : SECCIONES).join(', ')}).`); return v }
  const ocultar = lista(o.ocultar, 'ocultar'), mostrar = lista(o.mostrar, 'mostrar'), orden = lista(o.orden, 'orden')
  if (o.donde !== undefined && typeof o.donde !== 'string') throw new Error(`donde debe ser una de: ${DONDES.join(', ')}.`)
  const donde = o.donde as string | undefined
  if (o.restablecer !== undefined && typeof o.restablecer !== 'boolean') throw new Error('restablecer debe ser true o false.')
  const restablecer = o.restablecer === true
  // Carril U: en cliente el «+» solo tiene Lienzo, Archivos y Taller; nombrar otra sección es un error, no un cambio invisible.
  const cliente = esEdicionCliente()
  const existen: readonly (typeof SECCIONES)[number][] = cliente ? SECCIONES_PANEL_CLIENTE : SECCIONES
  if (cliente) for (const [campo, xs] of [['ocultar', ocultar], ['mostrar', mostrar], ['orden', orden]] as const) for (const x of xs ?? []) {
    const id = idDeSeccion(x)
    if (!id || !existen.includes(id)) throw new Error(`${campo}: «${String(x)}» no es una sección del «+» en esta edición. Son: ${existen.map(s => NOMBRES_SECCION[s]).join(', ')}.`)
  }
  const describirAjustes = (a: Parameters<typeof describirAjustesTodas>[0]) => describirAjustesTodas(a, existen)
  if (!ocultar && !mostrar && !orden && !restablecer && donde === undefined) return { text: `${describirAjustes(leerAjustes().ajustes)} Para cambiarlo: panel {accion:"secciones", ocultar|mostrar|orden|donde|restablecer}.` }
  const antes = leerAjustes().ajustes
  const objetivos = clientesVivos()
  const nueva = aplicarAjustes({ restablecer, orden, ocultar, mostrar, donde }, 'Levy')
  const { acusaron, sinRespuesta } = await esperarAjustes(nueva.rev, objetivos, { esperaMs: Number(process.env.ARBRAIN_PANEL_ESPERA_MS) || 8000 })
  const cambios = [
    ...nueva.ocultas.filter(s => existen.includes(s) && !antes.ocultas.includes(s)).map(s => `ocultó ${NOMBRES_SECCION[s]}`),
    ...antes.ocultas.filter(s => existen.includes(s) && !nueva.ocultas.includes(s)).map(s => `volvió a mostrar ${NOMBRES_SECCION[s]}`),
    ...(nueva.orden.filter(s => existen.includes(s)).join() !== antes.orden.filter(s => existen.includes(s)).join() ? ['cambió el orden'] : []),
    ...(nueva.donde !== antes.donde ? [`ahora lo que abres cae en ${NOMBRES_DONDE[nueva.donde]}`] : []),
  ]
  const hecho = `Config del «+» escrita (v${nueva.rev}): ${cambios.join(', ') || 'sin cambios (ya estaba así)'}. ${describirAjustes(nueva)}`
  if (!objetivos.length) return { text: `NO confirmado: ${hecho} Pero no hay ninguna app de Arbrain conectada ahora: la verá en cuanto abra. No le digas a ${DUENO} que ya lo ve.`, error: true }
  if (sinRespuesta.length) return { text: `NO confirmado del todo: ${hecho} Aplicaron: ${acusaron.map(c => c.etiqueta).join(', ') || 'ninguna'}. Sin respuesta: ${sinRespuesta.map(c => c.etiqueta).join(', ')} (la config queda escrita; la tomará en su próximo latido). Verifica con panel {accion:"listar"} antes de afirmar.`, error: true }
  return { text: `${hecho} Confirmado por ${acusaron.map(c => c.etiqueta).join(', ')}: ya lo aplicó${cambios.some(c => c.startsWith('ocultó')) ? ' y cerró las pestañas de lo oculto' : ''}.` }
}

function archivero(o: Record<string, unknown>): { text: string; error?: boolean } {
  if (o.accion === 'listar') {
    const { entradas } = leerArchivero()
    return { text: entradas.length ? `${entradas.length} en el archivero:\n${entradas.map(describir).join('\n')}` : 'El archivero está vacío.' }
  }
  const quien = typeof o.id === 'string' ? o.id.trim() : ''
  if (!quien) throw new Error(`${o.accion ?? 'archivero'} necesita id (o el nombre de la entrada).`)
  if (o.accion === 'abrir') {
    const e = pedirAbrir(quien)
    return e ? { text: `«${e.nombre}» se abrirá como pestaña en el panel de ${DUENO} en unos segundos (la app atiende el pedido).` } : { text: `No hay nada guardado como «${quien}». Usa accion listar.`, error: true }
  }
  if (o.accion === 'sacar') {
    const e = sacarDelArchivero(quien)
    return e ? { text: `«${e.nombre}» salió del archivero.${e.rutaOriginal ? ` Su copia ${e.input.ruta} sigue en el repo.` : ''}` } : { text: `No hay nada guardado como «${quien}». Usa accion listar.`, error: true }
  }
  throw new Error('accion debe ser listar, abrir o sacar.')
}

/** La conversación de esta Cabina: la pone el agent-server en el entorno del servidor MCP (stdio). */
function scopeDeCabina(): { owner: string; account: string; conversationId: string } {
  try {
    const s = JSON.parse(process.env.ARBRAIN_CABINA_SCOPE ?? '') as Record<string, unknown>
    if ([s.owner, s.account, s.conversationId].every(v => typeof v === 'string' && v)) return s as { owner: string; account: string; conversationId: string }
  } catch { /* sin conversación */ }
  throw new Error('Los despertadores solo existen dentro de una conversación del chat de Arbrain.')
}

async function despertador(o: Record<string, unknown>): Promise<{ text: string; error?: boolean }> {
  const scope = scopeDeCabina()
  const [{ default: Database }, { join }, { STORE_DIR }, { Despertadores, describirDespertador }] = await Promise.all([
    import('better-sqlite3'), import('node:path'), import('../config.js'), import('../chat-runtime/despertadores.js'),
  ])
  const db = new Database(join(STORE_DIR, 'claudeclaw.db'))
  try {
    const d = new Despertadores(db)
    const num = (v: unknown) => v === undefined || v === null ? undefined : Number(v)
    if (o.accion === 'crear') {
      const nuevo = d.crear(scope, { texto: String(o.texto ?? ''), enMinutos: num(o.enMinutos), aLas: typeof o.aLas === 'string' ? o.aLas : undefined, cadaMinutos: num(o.cadaMinutos), veces: num(o.veces) })
      return { text: `Despertador creado: ${describirDespertador(nuevo)}. Es durable: sobrevive a reinicios. ${DUENO_M} lo ve como pendiente en la conversación. Termina tu respuesta; al vencer te llega aquí el texto.` }
    }
    if (o.accion === 'listar') {
      const lista = d.listar(scope, true).slice(0, 20)
      return { text: lista.length ? lista.map(x => describirDespertador(x)).join('\n') : 'Esta conversación no tiene despertadores.' }
    }
    if (o.accion === 'cancelar') {
      if (typeof o.id !== 'string' || !o.id) throw new Error('cancelar necesita id.')
      return d.cancelar(scope, o.id) ? { text: `Despertador ${o.id} cancelado.` } : { text: `No hay un despertador pendiente ${o.id} en esta conversación.`, error: true }
    }
    throw new Error('accion debe ser crear, listar o cancelar.')
  } finally { db.close() }
}

/** Codex recibe los mismos verbos como dynamicTools con prefijo explícito. Sin `despertador` por ahora:
 * su servidor no recibe la conversación (pendiente; los despertadores nacieron para el chat de Claude). */
export function cabinaDynamicTools() {
  return cabinaToolsVisibles().filter(t => t.name !== 'despertador').map(t => ({ name: `cabina_${t.name}`, description: t.description, inputSchema: t.inputSchema }))
}

/**
 * Herramientas de la Cabina que ve el modelo. Edición cliente (red team A1, 11 oct 2026): sin `delegar` ni el resto
 * de la familia de subagentes. Esos subagentes son CLIs aparte (Claude en `auto`, Codex sin aprobaciones) que no pasan
 * por la guardia ni por la confirmación humana, corren fuera del cerebro y sobreviven a la app; el trabajo largo del
 * alumno lo hace el propio chat (con su Task interno, que sí pasa por la guardia). Daniel: todas, como siempre.
 */
export function cabinaToolsVisibles(): Array<(typeof CABINA_TOOLS)[number]> {
  return esEdicionCliente() ? cabinaToolsCliente() : [...CABINA_TOOLS]
}
/**
 * Herramientas que solo existen en la instalación original: `atender` marca avisos de su campana (carril T) y `pizarron`
 * enseña en una pestaña que la web del alumno no tiene en la v1 (carril U; MAPA-WEB › Pizarrón).
 */
export const CABINA_SOLO_ORIGINAL = new Set(['atender', 'pizarron'])
/** Por qué una herramienta de CABINA_SOLO_ORIGINAL no corre en cliente. */
export const motivoSoloOriginal = (tool: string) => tool === 'pizarron' ? SIN_PIZARRON_CLIENTE : SIN_CAMPANA_CLIENTE
export const SIN_PIZARRON_CLIENTE = 'El pizarrón no está disponible en esta edición de Arbrain. Explica en el chat y, si ayuda, dibuja en el lienzo o enseña un documento.'

/**
 * Textos de la Cabina en la edición cliente (carril U, 11 oct 2026): describen SOLO lo que existe en la app del alumno
 * (vistas lienzo, memoria, documento y explorador; el «+» con Lienzo, Archivos y Taller) y nada de la operación de la
 * instalación original. Una sola fuente: los esquemas son los de CABINA_TOOLS; aquí solo cambian las descripciones, se
 * recortan los enums a la edición y se quitan los campos de vistas que no existen. `quien` = el dueño de la instalación
 * («la persona» o `ARBRAIN_DUENO`), leído al pedir la lista y no al cargar el módulo.
 */
export function textosCabinaCliente(quien = dueno()) {
  const Quien = quien.charAt(0).toLocaleUpperCase('es') + quien.slice(1)
  const mostrar = `Muestra a ${quien}, DENTRO de esta conversación de Arbrain, una vista viva (no un dibujo): la app monta el componente y lee la fuente en vivo; al recargar la conversación vuelve con datos frescos.
Vistas (son las únicas de esta edición): calendario (su plan y su agenda: objetivo del mes, la semana y el día, eventos, bloques y tareas con fecha; alcance dia|semana|mes y fecha AAAA-MM-DD opcionales; lee .claude/plan/calendario.json, .claude/plan/objetivos.md y .claude/plan/habitos.json de su cerebro, que tú editas cuando pide agendar, planear o «agrega el hábito X»: cada JSON trae su instructivo dentro; en Día se ven y se marcan los hábitos con su racha) · lienzo (una página del lienzo por paginaId; zona opcional encuadra una parte) · memoria (memoria y contexto: lo que sabes de ${quien} —la carpeta .claude/memory de su cerebro por tipo, con buscador, fecha y lectura, sin credenciales— y la anatomía MEDIDA de la ventana de esta conversación: instrucciones (CLAUDE.md y sus imports), skills, herramientas, historial y la barra de la ventana; úsala cuando pregunte qué recuerdas o qué entra en tu contexto; abre Taller › Memoria en el panel y no se pinta en el chat) · documento (un archivo como pestaña; detalle abajo) · explorador (el árbol de archivos de su cerebro, como el lateral de un editor de código: carpetas plegables, íconos por tipo y búsqueda por nombre; respeta .gitignore y nunca enseña node_modules, .git ni credenciales; ${quien} toca un archivo y se abre en su pestaña de documento, el código en solo lectura con color. Es para que vea y controle; para enseñarle UN archivo usa documento con su ruta).
La vista aparece ARRIBA de tu texto en el mismo mensaje (nace al llamar la herramienta, antes de que redactes): refiérete a ella como «arriba» y deja tu pregunta o decisión para el final del texto. Úsala cuando ver algo ahorra una explicación o un clic fuera del chat. No la uses en cada respuesta ni para decorar; una o dos vistas por turno bastan. Mostrar no escribe nada. No afirmes lo que no consultaste: la vista lo pinta, tú no lo ves.
Por defecto la vista vive en el chat. fijar:true la deja además fija en el panel derecho de Arbrain: úsalo solo si ${quien} lo pide («fíjalo», «déjalo en el panel», «ábreme el lienzo») o si es algo que va a consultar mientras sigue la conversación. También puede fijarla con el botón «Fijar en el panel» de la vista.
El Lienzo es una pestaña viva del panel (y una sección de la barra izquierda): con fijar:true lo abres ahí y lo que muestres reemplaza lo que enseñaba. Dentro, ${quien} acerca, aleja y desplaza; «Expandir» lo lleva a la sección Lienzo completa en la misma página o zona, dentro de Arbrain. Las terminales viven en la pestaña Taller del panel.
documento (un archivo como pestaña con nombre propio; ruta relativa a su cerebro —la carpeta de trabajo de Arbrain— o absoluta en /tmp o en sus carpetas personales: ~/Movies, ~/Desktop, ~/Downloads, ~/Documents, ~/Pictures y ~/Music; titulo = el nombre de la pestaña): .md formateado con sus diagramas mermaid, .txt para leer, .html aislado con sus assets, .mmd/.mermaid como diagrama, imágenes y video (pausado y sin sonido). Nunca código: no lo enseñes. Se refresca sola si el archivo cambia, y en .md/.txt ${quien} puede editar y guardar (si tú lo cambiaste mientras editaba, no se pisa). compararCon ("HEAD" o la ruta de otra versión) enseña los cambios marcados por palabras. Para fijar un documento usa fijar:true; soltar:true con la misma ruta cierra su pestaña. Todo archivo se abre dentro de Arbrain, nunca en otra app: .pdf (páginas, zoom, búsqueda, texto seleccionable); video (fotograma a fotograma, velocidad, J/K/L, pantalla completa; compararCon = ruta de OTRA versión del mismo video para verlas lado a lado o alternando, versiones = lista de hasta 6 rutas para 3 o más; tiempo = segundo en el que abre; ${quien} puede marcar un instante y escribir un comentario, que te llega como mensaje «⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/v2.mp4»); audio (forma de onda y los mismos marcadores); imagen (galería de su carpeta y compararCon para deslizar entre dos); y una CARPETA como ruta se abre como entrega: finales primero, luego piezas (usa entrega.json de la carpeta si existe: {titulo, finales:[…], piezas:[…], nota}; si no, deduce por nombre).
Pestañas del panel: ${quien} las acomoda arrastrando y cierra cualquiera. fijar, soltar y guardar esperan el ACUSE de su app y responden con el panel real; soltar cierra toda pestaña de esa vista o ruta. Si la respuesta dice «NO confirmado» (app desconectada o sin responder), no afirmes que quedó hecho. Para ver qué tiene abierto de verdad usa la herramienta panel {accion:"listar"}. Lo que fijas tú y no guarda se cierra solo al cambiar de conversación. guardar:true la manda al ARCHIVERO («+ › Guardadas»: sobrevive a cerrar pestañas y conversaciones; un documento de /tmp se copia a docs/guardados/ y la entrada apunta a la copia); úsalo solo si ${quien} pide guardarla. Para listar, reabrir o sacar lo guardado usa la herramienta archivero.
zona (solo lienzo) ENCUADRA la parte que quieres que lea, a ancho de panel: id de un marco o elemento, prefijo de ids de una zona, rectángulo «x,y,ancho,alto» o una frase que aparezca en el lienzo. Sin zona un lienzo grande se ve como miniatura ilegible.`
  const abrir = `Lleva a ${quien} a la sección Lienzo completa de Arbrain (barra izquierda) cuando la vista dentro del chat o del panel se queda corta o lo pide («ábreme el lienzo en grande»). Todo pasa dentro de Arbrain: la barra, las conversaciones y el panel siguen a la mano y vuelve al chat con un clic. Al terminar tu respuesta la app navega sola (con opción de cancelar); en una conversación recargada queda como enlace, nunca navega por su cuenta.
Destino: lienzo (paginaId y zona opcional, la misma gramática que en mostrar; sin paginaId abre el último lienzo usado). Es el único destino de esta edición. Úsala como máximo una vez por turno.`
  const panel = `Las pestañas que ${quien} tiene abiertas AHORA en su panel derecho, tal como las reporta su app (no lo que tú creas haber fijado). accion: listar → por cliente conectado: id, nombre, vista, ruta o página, quién la abrió (Levy o ${quien}), si está guardada, a la vista y en qué ventana vive («en el Panel principal» o «en la Ventana N»). Lo que muestras va SOLO al cliente que tiene abierta esta conversación (o donde ${quien} escribió último); dentro de ese cliente cae en la ventana elegida en «Dónde abre Levy» (por defecto la de la izquierda) y el acuse de mostrar dice en cuál quedó. Úsala antes de afirmar qué ve ${quien} y para cerrar o verificar pestañas. Si no hay cliente conectado lo dice (error): entonces nada de lo que fijes, sueltes o guardes está confirmado. accion: secciones → el menú «+» y su orden: la MISMA configuración que ${quien} toca en Ajustes › Panel, difundida en vivo a todas sus ventanas. Sin más campos lista qué secciones muestra, en qué orden y cuáles están ocultas. Con ocultar:[…], mostrar:[…], orden:[…] (lo que nombras va primero, en ese orden, y lo demás detrás como estaba) o restablecer:true, escribe el cambio y ESPERA el acuse de cada app conectada: ocultar una sección también cierra su pestaña. Las secciones de esta edición son: calendario, lienzo, explorador (Archivos) y taller; acepta el nombre o el id. Si dice «NO confirmado», la config quedó escrita pero ninguna app la aplicó aún: no afirmes que ${quien} ya lo ve. Ocultar es reversible y no borra nada; úsalo solo si ${quien} lo pide.`
  const archivero = `El archivero del panel derecho de ${quien} («+ › Guardadas»): pestañas que guardó (o tú, por pedido suyo, con mostrar guardar:true) para reabrirlas luego. Vive en la carpeta de configuración de Arbrain. accion: listar (id, nombre, vista, conversación de origen, fechas; abiertoEn sirve para proponer limpiar lo no abierto en 30 días: nunca se borra solo) · abrir (id o nombre: la app la abre como pestaña en unos segundos) · sacar (id o nombre: la quita del archivero; no borra el archivo). Úsala cuando ${quien} diga «qué tengo guardado», «ábreme lo que guardé de X», «saca X de guardadas».`
  return { quien, Quien, mostrar, abrir, panel, archivero, despertador: textoDespertador(quien) }
}

type CabinaTool = (typeof CABINA_TOOLS)[number]
type Propiedades = Record<string, Record<string, unknown>>
/** Una herramienta con otra descripción y otras propiedades (quitar campos, reemplazar enum o descripción de un campo). */
function variante(t: CabinaTool, description: string, cambios: Record<string, Record<string, unknown> | null> = {}): CabinaTool {
  const props: Propiedades = { ...(t.inputSchema.properties as unknown as Propiedades) }
  for (const [k, v] of Object.entries(cambios)) { if (v === null) delete props[k]; else props[k] = { ...props[k], ...v } }
  return { ...t, description, inputSchema: { ...t.inputSchema, properties: props } } as unknown as CabinaTool
}

/** Las herramientas de la Cabina en la edición cliente, ya con sus textos. */
export function cabinaToolsCliente(quien = dueno()): CabinaTool[] {
  const tx = textosCabinaCliente(quien)
  const nombreSeccion = (s: string) => `${NOMBRES_SECCION[s as (typeof SECCIONES)[number]]} (${s})`
  const secciones = `Secciones de esta edición: ${SECCIONES_PANEL_CLIENTE.map(nombreSeccion).join(', ')}.`
  const visibles = CABINA_TOOLS.filter(t => !CABINA_SUBAGENTES.has(t.name) && !CABINA_SOLO_ORIGINAL.has(t.name))
  return visibles.map(t => {
    switch (t.name) {
      case 'mostrar': return variante(t, tx.mostrar, {
        vista: { enum: [...VISTAS_CLIENTE] },
        seccion: null, quien: null, agenteId: null,
        alcance: { description: 'Solo vista calendario: dia, semana (por defecto) o mes.' },
        fecha: { description: 'Solo vista calendario: AAAA-MM-DD dentro del periodo que quieres enseñar (por defecto hoy).' },
        enfoque: { description: `Una línea opcional: qué debe mirar ${quien} en la vista.` },
        fijar: { description: `Opcional, por defecto false: además de mostrarla en el chat, la fija en el panel derecho. Solo si ${quien} lo pide o la va a consultar mientras conversan.` },
        zona: { description: 'Solo vista lienzo: qué parte encuadrar para que se lea (id de marco o elemento, prefijo de ids de una zona, «x,y,ancho,alto» o una frase del lienzo).' },
        ruta: { description: 'Solo vista documento: el archivo (relativo a tu cerebro, /tmp/… o una carpeta personal como ~/Documents/…). .md, .txt, .html, .mmd, .pdf, imagen, audio o video; nunca código.' },
        tiempo: { description: `Solo documento de video o audio: segundo en el que abre (p. ej. 130.4 para llevar a ${quien} al instante que corriges).` },
        soltar: { description: `Cierra en el panel SOLO las pestañas que coinciden con esta vista y su ruta (documento) o paginaId (lienzo), la haya abierto ${quien} o tú; nunca las demás. Si no hay coincidencia no toca nada y lo dice. Responde con lo que la app confirmó.` },
        guardar: { description: `La guarda en el archivero («+ › Guardadas»). Solo si ${quien} pide guardarla. Un documento de /tmp se copia a docs/guardados/.` },
        titulo: { description: 'Encabezado corto opcional. En documento es el nombre de la pestaña («Notas de la reunión»).' },
      })
      case 'abrir': return variante(t, tx.abrir, { destino: { enum: [...DESTINOS_CLIENTE] }, alcance: null, fecha: null })
      case 'panel': return variante(t, tx.panel, {
        ocultar: { description: `Solo secciones: nombres o ids de las secciones del «+» que dejan de salir (su pestaña se cierra). ${secciones}` },
        mostrar: { description: `Solo secciones: las que vuelven a salir en el «+». ${secciones}` },
        restablecer: { description: 'Solo secciones: orden de fábrica, todo visible (y «Dónde abre Levy» en la izquierda).' },
        donde: { description: `Solo secciones: «Dónde abre Levy» (Ajustes › Panel). La ventana de Arbrain que recibe lo que abres con mostrar: la que esté a la izquierda de la pantalla (por defecto), la de la derecha o siempre el panel principal. Solo si ${quien} lo pide.` },
      })
      case 'archivero': return variante(t, tx.archivero)
      case 'despertador': return variante(t, tx.despertador, { texto: { description: `crear: qué debes hacer al despertar (para ti, no para ${quien}).` } })
      default: return t
    }
  })
}
export const SIN_CAMPANA_CLIENTE = 'La campana de avisos no está disponible en esta edición.'
export const MENSAJE_SIN_SUBAGENTES = 'Los subagentes (delegar, retomar, detener, interactivo, cerrar) no están disponibles en esta edición de Arbrain. Haz el trabajo tú en esta conversación.'
