// COPIA de sfterm/src/core/transcripts/qwen.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** EL PARSER DE QWEN CODE — y de GEMINI CLI, que es su origen.
 *
 *  `~/.qwen/projects/<slug-del-cwd>/chats/<uuid>.jsonl`
 *  `~/.gemini/projects/<slug-del-cwd>/chats/<uuid>.jsonl`
 *
 *  Qwen Code es un FORK de Gemini CLI: mismo layout de carpetas (el slug del
 *  cwd es el MISMO que usa Claude Code) y mismos registros. Por eso un solo
 *  adaptador sirve para los dos.
 *
 *  ⚠️ **Lo que esta ANCLADO y lo que esta INFERIDO** (la distincion importa):
 *  el FORMATO se midio contra sesiones REALES de qwen 0.22.0 el 24 ago 2026
 *  (fixture `transcript-qwen/`). La RAIZ de gemini (`~/.gemini/projects/…`) NO
 *  se pudo verificar: gemini-cli exige OAuth de Google y aqui no hay cuenta.
 *  El modo de fallar es benigno y a proposito — si la raiz no existe, gemini
 *  simplemente no aporta tarjetas; si existe pero el formato cambio, el parser
 *  devuelve cero mensajes y el lector dice "sin mensajes legibles". Nunca
 *  inventa. Cuando Daniel corra gemini una vez, se verifica y se quita esta
 *  nota.
 *
 *  ── EL FORMATO (medido) ───────────────────────────────────────────────────
 *  Cada linea: `{uuid, parentUuid, sessionId, timestamp, type, cwd, message}`.
 *    type "user"        → `message.parts[{text}]`
 *    type "assistant"   → `message.parts[]` con `{text}` · `{text, thought:true}`
 *                         (razonamiento) · `{functionCall:{id,name,args}}`;
 *                         ademas `model` y `usageMetadata`
 *    type "tool_result" → `message.parts[{functionResponse:{id,name,response}}]`
 *                         + `toolCallResult{callId,status,resultDisplay}`
 *    type "system"      → telemetria y snapshots: RUIDO, se descarta entero
 *
 *  Es un ARBOL (`uuid`/`parentUuid`), como pi: se camina del ULTIMO nodo a la
 *  raiz y se invierte, para leer la rama VIVA y no dos ramas pegadas.
 *
 *  ✅ **CON ctx%**, y es el unico de los nuevos que puede: qwen escribe
 *  `contextWindowSize` JUNTO al `usageMetadata` en cada respuesta del agente
 *  (medido: 262144 con kimi-k2.6). Teniendo la ventana en el propio archivo,
 *  el porcentaje es un dato y no una suposicion — a diferencia de pi, opencode
 *  y crush, donde el chip se omite porque la ventana vive en otro lado.
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

/** Slug de carpeta: el MISMO que usa Claude Code (todo lo no alfanumerico a
 *  guion). VERIFICADO contra `~/.qwen/projects/-private-tmp-harness-cap/`. */
export function qwenSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

interface Node {
  uuid: string;
  parent: string | null;
  raw: Obj;
  ts: number;
}

export function parseQwenTranscript(raw: string): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  let truncated = false;
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let model: string | undefined;
  let ctxPct: number | undefined;

  const nodes = new Map<string, Node>();
  const orden: Node[] = [];
  for (let i = 0; i < lines.length; i++) {
    let ev: Obj;
    try {
      ev = JSON.parse(lines[i]) as Obj;
    } catch {
      if (i === 0) truncated = true;
      continue;
    }
    sessionId = str(ev.sessionId) ?? sessionId;
    cwd = str(ev.cwd) ?? cwd;
    // la telemetria y los snapshots son del motor, no de la conversacion — y
    // ademas cuelgan de la MISMA cadena de parentUuid, asi que si se
    // descartaran sin re-enlazar romperian el arbol. Se conservan como nodos
    // (para no partir la cadena) y se ignoran al pintar.
    const uuid = str(ev.uuid);
    if (!uuid) continue;
    const n: Node = {
      uuid,
      parent: str(ev.parentUuid) ?? null,
      raw: ev,
      ts: Date.parse(str(ev.timestamp) ?? "") || 0,
    };
    nodes.set(uuid, n);
    orden.push(n);
  }

  // ── LA RAMA VIVA (mismo criterio que pi: el archivo es append-only)
  const rama: Node[] = [];
  let cur: Node | undefined = orden[orden.length - 1];
  const visto = new Set<string>();
  while (cur && !visto.has(cur.uuid)) {
    visto.add(cur.uuid);
    rama.push(cur);
    if (!cur.parent) break;
    const padre = nodes.get(cur.parent);
    if (!padre) {
      truncated = true; // el tail se llevo el principio
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
  let startedAt: number | undefined;
  const toolPorId = new Map<string, ToolPart>();
  const pendientes = new Set<string>();
  let ultimoRol: "user" | "assistant" | "tool" | null = null;

  for (const n of rama) {
    if (n.ts) lastEventAt = n.ts;
    const type = str(n.raw.type) ?? "";
    if (type === "system") continue; // telemetria: ni burbuja ni chip
    const m = obj(n.raw.message);
    if (!m) continue;
    const parts = arr(m.parts);

    if (type === "user") {
      open = null;
      ultimoRol = "user";
      outputTokens = 0;
      startedAt = n.ts || startedAt;
      const text = parts
        .map((p) => (obj(p)?.thought === true ? "" : (str(obj(p)?.text) ?? "")))
        .filter(Boolean)
        .join("\n")
        .trim();
      msgs.push({ id: id++, role: "user", text: text || "(sin texto)" });
      continue;
    }

    if (type === "tool_result") {
      ultimoRol = "tool";
      const res = obj(obj(n.raw.toolCallResult));
      for (const p of parts) {
        const fr = obj(obj(p)?.functionResponse);
        if (!fr) continue;
        const callId = str(fr.id) ?? "";
        pendientes.delete(callId);
        const part = toolPorId.get(callId);
        if (!part) continue;
        // `resultDisplay` es lo que el TUI enseña; `response.output` es el
        // crudo con su encabezado. Se prefiere el primero cuando existe.
        const display = str(res?.resultDisplay);
        const crudo = str(obj(fr.response)?.output) ?? "";
        part.output = (display || crudo).slice(0, 4000);
        if (str(res?.status) === "error") part.isError = true;
      }
      continue;
    }

    if (type !== "assistant") continue;
    ultimoRol = "assistant";
    model = str(n.raw.model) ?? model;
    const usage = obj(n.raw.usageMetadata);
    outputTokens += num(usage?.candidatesTokenCount) ?? 0;
    // la ventana viene EN EL ARCHIVO (`contextWindowSize`), asi que el chip de
    // contexto es un dato medido y no una tabla que hay que mantener
    const win = num(n.raw.contextWindowSize);
    const usado = num(usage?.totalTokenCount);
    if (win && win > 0 && usado != null) {
      ctxPct = Math.min(100, Math.round((usado / win) * 100));
    }

    if (!open) {
      open = { id: id++, role: "assistant", text: "", parts: [] };
      msgs.push(open);
    }
    for (const p of parts) {
      const o = obj(p);
      if (!o) continue;
      const fc = obj(o.functionCall);
      if (fc) {
        const callId = str(fc.id) ?? `qw-${n.uuid}-${open.parts!.length}`;
        const args = obj(fc.args) ?? {};
        const primero =
          str(args.command) ??
          str(args.file_path) ??
          str(args.path) ??
          str(args.pattern) ??
          str(args.query) ??
          Object.values(args).find((v): v is string => typeof v === "string") ??
          "";
        const part: ToolPart = {
          type: "tool",
          toolId: callId,
          name: str(fc.name) ?? "tool",
          summary: cut(primero.replace(/\s+/g, " "), 120),
          input: JSON.stringify(args, null, 2),
        };
        open.parts!.push(part);
        toolPorId.set(callId, part);
        pendientes.add(callId);
        continue;
      }
      const text = (str(o.text) ?? "").trim();
      if (!text) continue;
      if (o.thought === true) {
        open.parts!.push({
          type: "tool",
          toolId: `think-${n.uuid}-${open.parts!.length}`,
          name: "Pensando",
          summary: cut(text.split("\n")[0], 80),
          input: text,
        });
      } else {
        const last = open.parts![open.parts!.length - 1];
        if (last?.type === "text") last.text += `\n\n${text}`;
        else open.parts!.push({ type: "text", text });
      }
    }
  }

  // el turno se DERIVA de la forma de la rama (no hay marca de inicio/fin)
  const working = ultimoRol === "user" || ultimoRol === "tool" || pendientes.size > 0;

  let endsAsk = false;
  const lastMsg = msgs[msgs.length - 1];
  if (!working && lastMsg?.role === "assistant") {
    const ps = lastMsg.parts ?? [];
    for (let i = ps.length - 1; i >= 0; i--) {
      const p: Part = ps[i];
      if (p.type === "text" && p.text.trim()) {
        endsAsk = p.text.trim().endsWith("?");
        break;
      }
    }
  }

  const shown = msgs.length > MAX_MSGS ? msgs.slice(-MAX_MSGS) : msgs;
  if (shown.length < msgs.length) truncated = true;
  return {
    msgs: shown,
    model,
    sessionId,
    cwd,
    ctxPct,
    truncated,
    turn: { state: working ? "working" : "done", startedAt, lastEventAt, outputTokens, endsAsk },
  };
}
