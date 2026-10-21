// COPIA de sfterm/src/core/msgs.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** Modelo de MENSAJE compartido (extraido de chat.ts en la purga del 21 jul):
 *  los tipos y helpers que el transcript (jsonl del CLI) y sus vistas — el
 *  lector ⌃Tab, el peek ⌥Tab — necesitan, sin cargar con el chat nativo.
 *  Un assistant se compone de PARTS en orden: texto markdown y tool calls
 *  intercalados, como los produce el agente. */

/** Una imagen que vive DENTRO del transcript (base64 inline): la referencia,
 *  no los bytes. readTail stripea los blobs en el shell antes de cruzar el IPC
 *  (un screenshot pesa hasta 4MB y dejaba al lector en blanco), asi que esto es
 *  lo unico que sobrevive al espejo — y alcanza para pedirla bajo demanda con
 *  ipc.transcriptImage(path, uuid, index) cuando Daniel la abre.
 *
 *  ⚠️ `index` es el orden de documento de TODOS los bloques `image` de esa
 *  linea del jsonl, contando tambien los que van dentro de un tool_result.
 *  attach.rs::collect_images recorre EXACTAMENTE igual: si un lado cambia el
 *  recorrido, la imagen que se abre no es la que se clickeo. */
export interface MsgImage {
  /** uuid de la linea del jsonl (ancla estable para volver a buscarla) */
  uuid: string;
  index: number;
  mediaType: string;
}

export interface ToolPart {
  type: "tool";
  /** id del tool_use (para casarle su tool_result) */
  toolId: string;
  name: string;
  /** resumen de una linea (comando, path, url...) para el header del bloque */
  summary?: string;
  /** input completo (JSON bonito) para el detalle expandido */
  input?: string;
  /** output del tool_result (truncado) */
  output?: string;
  isError?: boolean;
  /** imagenes que devolvio el tool_result (screenshots de Playwright y demas) */
  images?: MsgImage[];
}
export interface TextPart {
  type: "text";
  text: string;
}
export type Part = TextPart | ToolPart;

export interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  /** linea de SISTEMA (maquinaria de slash commands): se pinta como chip
   *  sutil, no como burbuja (ej. "/model opus" · "Set model to Opus 4.8") */
  sys?: boolean;
  /** user: el texto tal cual. assistant viejo (pre-parts): markdown completo */
  text: string;
  /** assistant: fuente de verdad del render (texto + tools en orden) */
  parts?: Part[];
  /** user: paths de archivos adjuntos que viajaron en el prompt */
  attachments?: string[];
  /** user: imagenes pegadas EN el mensaje (base64 dentro del transcript) */
  images?: MsgImage[];
  streaming?: boolean;
  error?: string;
}

/** Markdown del mensaje completo (para copiar y para leer en voz). */
export function msgMarkdown(m: ChatMsg): string {
  if (!m.parts) return m.text;
  return m.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
}

/** Resumen de una linea de un tool call, por herramienta. */
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  if (name === "TodoWrite") return "actualiza el plan de tareas";
  const first =
    s(input.command) ||
    s(input.file_path) ||
    s(input.pattern) ||
    s(input.url) ||
    s(input.path) ||
    s(input.query) ||
    s(input.description) ||
    s(input.prompt) ||
    s(Object.values(input).find((v) => typeof v === "string"));
  return first.replace(/\s+/g, " ").slice(0, 120);
}

/** Nombre humano del modelo (el stream trae ids tipo "claude-fable-5").
 *
 *  ⚠️ SOLO se renombra lo que se conoce de verdad (24 ago 2026). Antes
 *  cualquier id con "kimi" adentro se pintaba "Kimi K3" — con codex y pi
 *  corriendo modelos arbitrarios por OpenRouter, eso significaba que una
 *  sesion de `moonshotai/kimi-k2.6` decia "Kimi K3" en el chip: un dato
 *  inventado en la superficie que existe justamente para decir con QUE estas
 *  hablando. Lo desconocido se muestra tal cual, sin el prefijo del proveedor
 *  (que es ruido, no informacion). */
export function modelPretty(id: string): string {
  const m = id.toLowerCase();
  if (m.includes("fable")) return "Fable 5";
  if (m.includes("mythos")) return "Mythos 5";
  if (m.includes("opus")) {
    if (m.includes("opus-5")) return "Opus 5";
    if (m.includes("4-8")) return "Opus 4.8";
    if (m.includes("4-7")) return "Opus 4.7";
    if (m.includes("4-6")) return "Opus 4.6";
    return "Opus";
  }
  if (m.includes("sonnet")) return m.includes("sonnet-5") ? "Sonnet 5" : "Sonnet";
  if (m.includes("haiku")) return m.includes("4-5") ? "Haiku 4.5" : "Haiku";
  // "openrouter/moonshotai/kimi-k2.6" → "kimi-k2.6"; "gpt-5.6-luna" tal cual
  return id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
}

/** Ventana de contexto del modelo, en tokens.
 *
 *  ⚠️ 1M es el DEFAULT de toda la generacion actual, no un beta que haya que
 *  pedir: Fable 5, Opus 5, Opus 4.8/4.7/4.6, Sonnet 5 y Sonnet 4.6 son de 1M.
 *  Los 200K son la EXCEPCION — Haiku 4.5 y las generaciones viejas (4.5 y
 *  anteriores, 3.x).
 *
 *  El bug que esto arregla (26 jul 2026, reporte de Daniel: "el limite no son
 *  200,000 tokens, son un millon ya practicamente en todos los modelos que
 *  utilizo... el numero de 100% esta mal"): la lista vieja solo conocia
 *  `fable` y `opus-4-8`, asi que Opus 5 caia al default de 200K y la barra
 *  marcaba 100% con la sesion apenas empezada — 5x inflado.
 *
 *  Ojo con los guiones al leer los patrones: "claude-opus-4-5" NO matchea
 *  /opus-5/ (lleva "4-" en medio), que es justo lo que hace que la misma
 *  regla sirva para distinguir Opus 5 de Opus 4.5. */
export function ctxWindowFor(model: string | undefined): number {
  const m = (model ?? "").toLowerCase();
  if (/haiku/.test(m)) return 200_000;
  if (/fable|mythos|opus-5|sonnet-5|opus-4-8|opus-4-7|opus-4-6|sonnet-4-6/.test(m)) {
    return 1_000_000;
  }
  return 200_000; // 4.5 y anteriores
}

/** % de contexto consumido a partir del usage de un result del stream. */
export function ctxPctFrom(usage: Record<string, unknown>, model: string | undefined, modelUsage?: Record<string, unknown>): number | null {
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const used =
    n(usage.input_tokens) +
    n(usage.cache_creation_input_tokens) +
    n(usage.cache_read_input_tokens) +
    n(usage.output_tokens);
  if (!used) return null;
  // ventana: si el result la reporta (modelUsage[*].contextWindow), esa manda
  let win = 0;
  for (const v of Object.values(modelUsage ?? {})) {
    const cw = (v as Record<string, unknown>)?.contextWindow;
    if (typeof cw === "number" && cw > 0) win = cw;
  }
  if (!win) win = ctxWindowFor(model);
  // AUTO-CORRECCION: si lo consumido ya supera la ventana que asumimos, la
  // que esta mal es la suposicion (modelo nuevo que la tabla no conoce), no
  // la sesion. Subir de escalon antes que pintar un 100% mentiroso.
  if (used > win && win < 1_000_000) win = 1_000_000;
  return Math.min(100, Math.round((used / win) * 100));
}

/** EL CONTRATO DEL ESPEJO — lo que TODO adaptador de transcript devuelve.
 *
 *  Vive aqui (modulo puro, cero imports) y no en un parser concreto porque es
 *  justo lo que hace al lector agnostico de proveedor: claude, codex y pi
 *  hablan formatos distintos en disco y salen por esta misma puerta. Un campo
 *  que un harness no puede llenar HONESTAMENTE se omite — la UI ya esconde el
 *  segmento sin dato (jamas se inventa un modelo ni un ctx%). */
export interface ParsedTranscript {
  msgs: ChatMsg[];
  title?: string;
  model?: string;
  /** effort del ultimo assistant (campo top-level del jsonl) */
  effort?: string;
  sessionId?: string;
  cwd?: string;
  /** % de contexto consumido (del usage del ultimo mensaje assistant) */
  ctxPct?: number;
  /** el tail corto el archivo: el inicio de la conversacion no esta */
  truncated: boolean;
  /** el espejo NO pudo leer (archivo inexistente, permiso, timeout). Existe
   *  para no confundir "no pude leerla" con "esta vacia": hasta el 27 jul las
   *  dos salian como "esta sesion aun no tiene mensajes legibles" y el fallo
   *  se veia identico a una conversacion recien nacida. */
  error?: string;
  /** Pulso del turno actual (espejo del spinner de la TUI): estado + inicio +
   *  ultima actividad + tokens de salida del turno (subagentes incluidos) +
   *  si la ultima respuesta termina preguntandote algo. */
  turn?: {
    state: "working" | "done";
    startedAt?: number;
    lastEventAt?: number;
    outputTokens: number;
    endsAsk: boolean;
  };
}
