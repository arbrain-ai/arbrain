// COPIA de sfterm/src/core/transcripts/crush.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** EL PARSER DE CRUSH (Charm) — `<cwd>/.crush/crush.db`, SQLite.
 *
 *  PURO: recibe el JSONL que produce el `readCommand` del harness (una consulta
 *  con `sqlite3 -readonly`) y devuelve `ParsedTranscript`.
 *
 *  ── DONDE GUARDA, que es lo raro de crush ─────────────────────────────────
 *  No hay una base global: **cada proyecto tiene la suya**, en `<cwd>/.crush/`.
 *  Eso hace TRIVIAL la resolucion por cwd (la base esta en la carpeta) y
 *  costoso el censo del historial — por eso el indice sale de
 *  `~/.local/share/crush/projects.json`, que es la lista de proyectos que el
 *  propio crush mantiene. Ver `src-tauri/src/harness.rs`.
 *
 *  ── EL FORMATO, MEDIDO (24 ago 2026, crush v0.91.0, sesiones reales) ──────
 *    `sessions(id, title, message_count, prompt_tokens, completion_tokens, …)`
 *    `messages(id, session_id, role, parts, model, provider, created_at, …)`
 *
 *  `parts` es un JSON array y ahi vive todo:
 *    {"type":"text","data":{"text":…}}
 *    {"type":"reasoning","data":{…}}
 *    {"type":"tool_call","data":{id,name,input,finished}}   ⚠️ `input` es un
 *        STRING con JSON adentro, no un objeto
 *    {"type":"tool_result","data":{tool_call_id,name,content,is_error}}
 *    {"type":"finish","data":{reason,time}}   ← lo que cierra el turno
 *
 *  Lo comodo: el tool_result vive en el MISMO array que su llamada (o en el
 *  mensaje siguiente), y se cose por `tool_call_id`.
 *
 *  ⚠️ **SIN ctx%.** La tabla trae `prompt_tokens` pero no la ventana del
 *  modelo. Sin ventana no hay porcentaje honesto.
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

/** `input` de un tool_call: crush lo guarda como STRING con JSON adentro.
 *  Si no parsea, se devuelve tal cual — mejor el crudo que nada. */
function argsDe(v: unknown): { pretty: string; resumen: string } {
  const s = str(v) ?? "";
  try {
    const o = obj(JSON.parse(s));
    if (o) {
      const primero =
        str(o.command) ??
        str(o.file_path) ??
        str(o.path) ??
        str(o.pattern) ??
        str(o.query) ??
        Object.values(o).find((x): x is string => typeof x === "string") ??
        "";
      return { pretty: JSON.stringify(o, null, 2), resumen: primero };
    }
  } catch {
    /* crudo */
  }
  return { pretty: s, resumen: s };
}

export function parseCrushTranscript(raw: string): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  let truncated = false;
  let model: string | undefined;
  let sessionId: string | undefined;

  const msgs: ChatMsg[] = [];
  let id = 1_000_000;
  let open: ChatMsg | null = null;
  let lastEventAt: number | undefined;
  let outputTokens = 0;
  let startedAt: number | undefined;
  const toolPorId = new Map<string, ToolPart>();
  const pendientes = new Set<string>();
  let ultimoRol: "user" | "assistant" | "tool" | null = null;
  let cerrado = false;

  for (let i = 0; i < lines.length; i++) {
    let ev: Obj;
    try {
      ev = JSON.parse(lines[i]) as Obj;
    } catch {
      if (i === 0) truncated = true;
      continue;
    }
    if (str(ev.k) !== "m") continue;
    sessionId = str(ev.session) ?? sessionId;
    // crush guarda created_at en SEGUNDOS (no ms como los demas)
    const t = num(ev.t);
    if (t) lastEventAt = t < 1e12 ? t * 1000 : t;
    const role = str(ev.role) ?? "";
    const prov = str(ev.provider);
    const mid = str(ev.model);
    if (mid) model = prov && !mid.includes("/") ? `${prov}/${mid}` : mid;
    const parts = arr(ev.parts);

    if (role === "user") {
      open = null;
      ultimoRol = "user";
      cerrado = false;
      outputTokens = 0;
      startedAt = lastEventAt;
      const text = parts
        .map((p) => (str(obj(p)?.type) === "text" ? (str(obj(obj(p)?.data)?.text) ?? "") : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      msgs.push({ id: id++, role: "user", text: text || "(sin texto)" });
      continue;
    }
    // ⚠️ EL RESULTADO DE LA HERRAMIENTA VIENE EN SU PROPIO MENSAJE, con rol
    // "tool" (no dentro del assistant, como en opencode). Saltarselo dejaba
    // cada herramienta pintada sin salida — se veia "corriendo" para siempre.
    if (role === "tool") {
      for (const p of parts) {
        const o = obj(p);
        if (str(o?.type) !== "tool_result") continue;
        const d = obj(o?.data) ?? {};
        const callId = str(d.tool_call_id) ?? "";
        pendientes.delete(callId);
        const part = toolPorId.get(callId);
        if (!part) continue;
        part.output = (str(d.content) ?? "").slice(0, 4000);
        if (d.is_error === true) part.isError = true;
      }
      continue;
    }

    if (role !== "assistant") continue;
    ultimoRol = "assistant";

    if (!open) {
      open = { id: id++, role: "assistant", text: "", parts: [] };
      msgs.push(open);
    }
    for (const p of parts) {
      const o = obj(p);
      const tipo = str(o?.type);
      const d = obj(o?.data) ?? {};
      if (tipo === "text") {
        const text = (str(d.text) ?? "").trim();
        if (!text) continue;
        const last = open.parts![open.parts!.length - 1];
        if (last?.type === "text") last.text += `\n\n${text}`;
        else open.parts!.push({ type: "text", text });
      } else if (tipo === "reasoning") {
        // crush lo llama `thinking` (medido); `text`/`reasoning` quedan de
        // respaldo por si otra version lo nombra distinto
        const think = (str(d.thinking) ?? str(d.text) ?? str(d.reasoning) ?? "").trim();
        if (!think) continue;
        open.parts!.push({
          type: "tool",
          toolId: `think-${str(ev.id) ?? ""}-${open.parts!.length}`,
          name: "Pensando",
          summary: cut(think.split("\n")[0], 80),
          input: think,
        });
      } else if (tipo === "tool_call") {
        const callId = str(d.id) ?? `cr-${open.parts!.length}`;
        const { pretty, resumen } = argsDe(d.input);
        const part: ToolPart = {
          type: "tool",
          toolId: callId,
          name: str(d.name) ?? "tool",
          summary: cut(resumen.replace(/\s+/g, " "), 120),
          input: pretty,
        };
        open.parts!.push(part);
        toolPorId.set(callId, part);
        if (d.finished !== true) pendientes.add(callId);
      } else if (tipo === "tool_result") {
        const callId = str(d.tool_call_id) ?? "";
        pendientes.delete(callId);
        const part = toolPorId.get(callId);
        if (part) {
          part.output = (str(d.content) ?? "").slice(0, 4000);
          if (d.is_error === true) part.isError = true;
        }
      } else if (tipo === "finish") {
        cerrado = true;
        outputTokens += num(d.output_tokens) ?? 0;
      }
    }
  }

  // el turno se DERIVA: lo cierra una parte `finish` del assistant
  const working = ultimoRol === "user" || pendientes.size > 0 || (ultimoRol === "assistant" && !cerrado);

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
    truncated,
    turn: { state: working ? "working" : "done", startedAt, lastEventAt, outputTokens, endsAsk },
  };
}
