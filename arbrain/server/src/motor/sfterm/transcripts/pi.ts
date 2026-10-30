// COPIA de sfterm/src/core/transcripts/pi.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** EL PARSER DE PI (~/.pi/agent/sessions/--<cwd>--/<ts>_<uuid>.jsonl).
 *
 *  PURO (cero imports a ipc), como claude.ts y codex.ts: los tres devuelven la
 *  MISMA `ParsedTranscript`.
 *
 *  ── EL FORMATO, MEDIDO (24 ago 2026, pi 0.84.2, sesiones reales de Daniel) ─
 *  Linea 1 es la cabecera: `{type:"session", version:3, id, timestamp, cwd}`.
 *  Despues, cada linea es un NODO con `id` (hex de 8) y `parentId`:
 *
 *    {"type":"model_change", provider, modelId}
 *    {"type":"thinking_level_change", thinkingLevel}
 *    {"type":"message", message:{role:"user",       content:[{type:"text",text}]}}
 *    {"type":"message", message:{role:"assistant",  content:[
 *        {type:"thinking",thinking}, {type:"text",text},
 *        {type:"toolCall",id,name,arguments}], provider, model, usage}}
 *    {"type":"message", message:{role:"toolResult", toolCallId, toolName,
 *        content:[{type:"text",text}], isError}}
 *
 *  ⚠️ **ES UN ARBOL, NO UNA LISTA.** `parentId` existe porque pi ramifica
 *  (editar un mensaje viejo cuelga una rama nueva del mismo padre) y el
 *  archivo es append-only: leerlo en orden de linea pintaria las DOS ramas
 *  pegadas, o sea una conversacion que nadie tuvo. Por eso se camina desde el
 *  ULTIMO nodo HACIA la raiz por `parentId` y se invierte: eso es la rama
 *  VIVA, la unica que el TUI esta mostrando. Si un `parentId` apunta a un nodo
 *  que el tail ya corto, la caminata termina ahi y se marca `truncated`.
 *
 *  ── LO QUE PI **NO** DICE Y POR ESO NO SE PINTA ───────────────────────────
 *  · **ctx%** — el jsonl trae `usage.input/output/cacheRead/cacheWrite` pero
 *    NO la ventana del modelo (vive en el catalogo, `~/.pi/agent/models*.json`).
 *    Sin ventana no hay porcentaje honesto, asi que el chip se omite y la
 *    ComposerBar ya esconde el segmento sin dato. Inventar 200K por defecto
 *    seria repetir el bug del 26 jul (barra al 100% con la sesion recien
 *    abierta). `ctxWindow` es el gancho para el dia que se lea el catalogo.
 *  · **estado del turno** — pi no escribe "empece"/"termine". Se DERIVA de la
 *    forma de la rama, que es lo unico que hay: si el ultimo nodo es un
 *    mensaje del usuario, o un toolResult, o un assistant que dejo toolCalls
 *    sin respuesta ⇒ el agente todavia debe algo (working). Si el ultimo es
 *    un assistant sin toolCalls pendientes ⇒ done.
 */
import { type ChatMsg, type ParsedTranscript, type Part, type ToolPart } from "../msgs.js";

const MAX_MSGS = 600;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** El slug de carpeta con el que pi agrupa las sesiones por cwd:
 *  `/private/tmp/harness-cap` → `--private-tmp-harness-cap--`. VERIFICADO
 *  contra las 9 carpetas reales del disco de Daniel (24 ago 2026). */
export function piSlug(cwd: string): string {
  return `--${cwd.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-")}--`;
}

/** Texto de un `content[]` de pi (bloques `{type:"text", text}`). */
function textOf(content: unknown): string {
  return arr(content)
    .map((b) => {
      const o = obj(b);
      return str(o?.type) === "text" ? (str(o?.text) ?? "") : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Argumentos de un toolCall como resumen de una linea. `arguments` es un
 *  objeto ya parseado ({command, path, pattern…}) — el mismo criterio de
 *  `toolSummary` de claude, escrito aparte porque pi nombra sus llaves solo. */
function argSummary(args: Obj): string {
  const first =
    str(args.command) ??
    str(args.path) ??
    str(args.file_path) ??
    str(args.pattern) ??
    str(args.query) ??
    str(args.url) ??
    str(args.description) ??
    Object.values(args).find((v): v is string => typeof v === "string") ??
    "";
  return cut(first.replace(/\s+/g, " "), 120);
}

interface Node {
  id: string;
  parentId: string | null;
  type: string;
  raw: Obj;
  ts: number;
}

export function parsePiTranscript(raw: string, ctxWindow?: number): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  let truncated = false;
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let model: string | undefined;
  let effort: string | undefined;

  const nodes = new Map<string, Node>();
  const orden: Node[] = [];
  for (let i = 0; i < lines.length; i++) {
    let ev: Obj;
    try {
      ev = JSON.parse(lines[i]) as Obj;
    } catch {
      if (i === 0) truncated = true; // el tail corto la primera linea
      continue;
    }
    const type = str(ev.type) ?? "";
    if (type === "session") {
      sessionId = str(ev.id) ?? sessionId;
      cwd = str(ev.cwd) ?? cwd;
      continue;
    }
    const id = str(ev.id);
    if (!id) continue;
    const n: Node = {
      id,
      parentId: str(ev.parentId) ?? null,
      type,
      raw: ev,
      ts: Date.parse(str(ev.timestamp) ?? "") || 0,
    };
    nodes.set(id, n);
    orden.push(n);
  }

  // ── LA RAMA VIVA: del ultimo nodo a la raiz por parentId, y al derecho.
  const rama: Node[] = [];
  let cur: Node | undefined = orden[orden.length - 1];
  const visto = new Set<string>();
  while (cur && !visto.has(cur.id)) {
    visto.add(cur.id);
    rama.push(cur);
    if (!cur.parentId) break;
    const padre = nodes.get(cur.parentId);
    if (!padre) {
      // el padre se lo llevo el tail: la conversacion empieza antes de lo que
      // vemos. Honesto: decirlo, no fingir que este es el principio.
      truncated = true;
      break;
    }
    cur = padre;
  }
  rama.reverse();

  const msgs: ChatMsg[] = [];
  let id = 1_000_000;
  let open: ChatMsg | null = null;
  let lastEventAt: number | undefined;
  let outputTokens = 0;
  /** toolCalls emitidos y todavia sin su toolResult (dice si el turno sigue) */
  const pendientes = new Set<string>();
  /** parte de tool por toolCallId, para pegarle su salida cuando llegue */
  const toolPorId = new Map<string, ToolPart>();
  let ultimoRol: "user" | "assistant" | "toolResult" | null = null;

  for (const n of rama) {
    if (n.ts) lastEventAt = n.ts;
    if (n.type === "model_change") {
      const prov = str(n.raw.provider);
      const mid = str(n.raw.modelId);
      model = mid ? (prov ? `${prov}/${mid}` : mid) : model;
      continue;
    }
    if (n.type === "thinking_level_change") {
      effort = str(n.raw.thinkingLevel) ?? effort;
      continue;
    }
    if (n.type !== "message") continue;
    const m = obj(n.raw.message);
    if (!m) continue;
    const role = str(m.role) ?? "";

    if (role === "user") {
      open = null;
      ultimoRol = "user";
      outputTokens = 0;
      const text = textOf(m.content);
      msgs.push({ id: id++, role: "user", text: text || "(sin texto)" });
      continue;
    }

    if (role === "toolResult") {
      ultimoRol = "toolResult";
      const callId = str(m.toolCallId) ?? "";
      pendientes.delete(callId);
      const part = toolPorId.get(callId);
      if (part) {
        part.output = textOf(m.content).slice(0, 4000);
        if (m.isError === true) part.isError = true;
      }
      continue;
    }

    if (role !== "assistant") continue;
    ultimoRol = "assistant";
    // el modelo REAL del mensaje manda sobre el ultimo model_change
    const prov = str(m.provider);
    const mid = str(m.model);
    if (mid) model = prov && !mid.includes("/") ? `${prov}/${mid}` : mid;
    const usage = obj(m.usage);
    const out = num(usage?.output);
    if (out != null) outputTokens += out;

    if (!open) {
      open = { id: id++, role: "assistant", text: "", parts: [] };
      msgs.push(open);
    }
    for (const b of arr(m.content)) {
      const o = obj(b);
      const t = str(o?.type);
      if (t === "text") {
        const text = (str(o?.text) ?? "").trim();
        if (!text) continue;
        const last = open.parts![open.parts!.length - 1];
        if (last?.type === "text") last.text += `\n\n${text}`;
        else open.parts!.push({ type: "text", text });
      } else if (t === "thinking") {
        const think = (str(o?.thinking) ?? "").trim();
        if (!think) continue;
        open.parts!.push({
          type: "tool",
          toolId: `think-${n.id}-${open.parts!.length}`,
          name: "Pensando",
          summary: cut(think.split("\n")[0], 80),
          input: think,
        });
      } else if (t === "toolCall") {
        const callId = str(o?.id) ?? `pi-${n.id}-${open.parts!.length}`;
        const args = obj(o?.arguments) ?? {};
        const part: ToolPart = {
          type: "tool",
          toolId: callId,
          name: str(o?.name) ?? "tool",
          summary: argSummary(args),
          input: JSON.stringify(args, null, 2),
        };
        open.parts!.push(part);
        toolPorId.set(callId, part);
        pendientes.add(callId);
      }
    }
  }

  // ── EL TURNO, DERIVADO (pi no lo escribe; ver cabecera).
  const working = ultimoRol === "user" || ultimoRol === "toolResult" || pendientes.size > 0;
  // arranque del turno = el ultimo mensaje del usuario de la rama
  let startedAt: number | undefined;
  for (let i = rama.length - 1; i >= 0; i--) {
    const m = obj(rama[i].raw.message);
    if (str(m?.role) === "user") {
      startedAt = rama[i].ts || undefined;
      break;
    }
  }

  let endsAsk = false;
  const lastMsg = msgs[msgs.length - 1];
  if (!working && lastMsg?.role === "assistant") {
    const parts = lastMsg.parts ?? [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const p: Part = parts[i];
      if (p.type === "text" && p.text.trim()) {
        endsAsk = p.text.trim().endsWith("?");
        break;
      }
    }
  }

  // ctx% SOLO si alguien nos dio la ventana (ver cabecera: pi no la escribe)
  let ctxPct: number | undefined;
  if (ctxWindow && ctxWindow > 0) {
    let usado = 0;
    for (let i = rama.length - 1; i >= 0; i--) {
      const u = obj(obj(rama[i].raw.message)?.usage);
      if (!u) continue;
      usado = (num(u.input) ?? 0) + (num(u.cacheRead) ?? 0) + (num(u.output) ?? 0);
      break;
    }
    if (usado) ctxPct = Math.min(100, Math.round((usado / ctxWindow) * 100));
  }

  const shown = msgs.length > MAX_MSGS ? msgs.slice(-MAX_MSGS) : msgs;
  if (shown.length < msgs.length) truncated = true;
  return {
    msgs: shown,
    model,
    effort,
    sessionId,
    cwd,
    ctxPct,
    truncated,
    turn: {
      state: working ? "working" : "done",
      startedAt,
      lastEventAt,
      outputTokens,
      endsAsk,
    },
  };
}
