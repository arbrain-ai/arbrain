// COPIA de sfterm/src/core/transcripts/codex.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** EL PARSER DE CODEX CLI (~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl).
 *
 *  PURO (cero imports a ipc), como sus hermanos claude.ts y pi.ts: los tres
 *  devuelven la MISMA `ParsedTranscript` y por eso el lector no sabe con que
 *  CLI esta hablando.
 *
 *  ── EL ROLLOUT, MEDIDO (24 ago 2026, codex 0.149.0/0.149.1, sesiones reales
 *  de Daniel en ~/.codex/sessions) ────────────────────────────────────────
 *  Cada linea es `{timestamp, ordinal, type, payload}` y hay DOS capas
 *  superpuestas contando la misma historia:
 *
 *    · `response_item`  — los items CRUDOS de la API (message / reasoning /
 *      custom_tool_call / custom_tool_call_output). Es el cable, no la
 *      conversacion: el reasoning viene `encrypted_content`, el tool call es
 *      un `tools.exec_command({...})` en JS y su salida llega en otra linea
 *      que hay que casar por `call_id`.
 *    · `event_msg` con `type:"item_completed"` — los items ya en forma de UI:
 *      `{item: {type: "UserMessage"|"AgentMessage"|"CommandExecution"|
 *      "FileChange"|"Reasoning"|"ImageView"|"ContextCompaction"|…, id, …}}`.
 *      El CommandExecution ya trae `command`, `parsed_cmd`, `status` y su
 *      `stdout` PEGADO; el FileChange trae los `unified_diff` por archivo.
 *
 *  Este parser lee la SEGUNDA capa. Es la que corresponde 1:1 con lo que el
 *  TUI pinta, y evita el casamiento manual de call_ids (una fuente de bugs
 *  silenciosos: un output huerfano se ve identico a un tool sin salida).
 *  Medido sobre 5 rollouts reales: 649 `item_completed` contra 360 pares de
 *  `custom_tool_call` + `custom_tool_call_output` que habria que coser.
 *
 *  Los items se indexan POR ID conservando el orden de aparicion, y
 *  `item_started`/`item_updated` (si la version los emite) sobreescriben al
 *  mismo id: asi el streaming entra gratis y una version que solo mande
 *  `item_completed` se comporta igual que hoy.
 *
 *  Lo que SI se puede decir honestamente y de donde sale:
 *    · modelo   → `turn_context.model` (el ultimo manda; cambia con /model)
 *    · effort   → `turn_context.collaboration_mode.settings.reasoning_effort`
 *    · cwd/sid  → `session_meta`, y `turn_context.cwd` como respaldo cuando el
 *                 tail corto la cabeza del archivo
 *    · ctx%     → `event_msg/token_count`: `last_token_usage.total_tokens`
 *                 sobre `model_context_window`. ⚠️ `total_token_usage` es el
 *                 ACUMULADO de la sesion entera (suma de todos los turnos) —
 *                 usarlo pintaria 300% de contexto en una sesion larga. Lo que
 *                 ocupa la ventana es la ULTIMA peticion.
 *    · turno    → `task_started` abre, `task_complete`/`turn_aborted` cierran.
 */
import { type ChatMsg, type ParsedTranscript, type Part } from "../msgs.js";

/** Tope de mensajes pintados — mismo criterio que el parser de claude. */
const MAX_MSGS = 600;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Texto de un `content[]` de codex: bloques `{type:"text"|"input_text"|
 *  "output_text", text}`. Se ignora todo lo que no traiga texto. */
function contentText(content: unknown): string {
  return arr(content)
    .map((b) => {
      const o = obj(b);
      const t = str(o?.type) ?? "";
      return /text/i.test(t) ? (str(o?.text) ?? "") : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** El comando de un CommandExecution como UNA linea legible.
 *  `command` viene como argv (`["/bin/zsh","-lc","rg -n …"]`): mostrar el argv
 *  crudo seria ruido — lo que Daniel reconoce es el ultimo elemento, que es el
 *  script. `parsed_cmd` (cuando codex lo entiende) es todavia mejor. */
function commandLine(item: Obj): string {
  const parsed = arr(item.parsed_cmd)
    .map((p) => str(obj(p)?.cmd))
    .filter(Boolean);
  if (parsed.length) return parsed.join(" ; ");
  const cmd = arr(item.command).map((c) => str(c) ?? "");
  if (!cmd.length) return "";
  const last = cmd[cmd.length - 1] ?? "";
  // `zsh -lc "<script>"` → el script; cualquier otra cosa → el argv pegado
  return /^-l?c$/.test(cmd[cmd.length - 2] ?? "") ? last : cmd.join(" ");
}

/** file:///ruta → /ruta (codex reporta rutas como URLs). */
function unfile(p: string | undefined): string {
  if (!p) return "";
  return p.startsWith("file://") ? decodeURIComponent(p.slice(7)) : p;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** UN item de codex → parte(s) del mensaje del assistant, o null si no aporta
 *  (un Reasoning cifrado sin resumen no es "pensando en blanco": es nada). */
function partsForItem(item: Obj, idx: number): Part[] {
  const type = str(item.type) ?? "";
  const id = str(item.id) ?? `cx-${idx}`;
  switch (type) {
    case "AgentMessage": {
      const text = contentText(item.content);
      return text ? [{ type: "text", text }] : [];
    }
    case "Reasoning": {
      // `summary_text` es el resumen en claro; `raw_content`, el crudo cuando
      // el proveedor lo permite. Con `encrypted_content` no hay nada legible.
      const sum = arr(item.summary_text)
        .map((s) => str(s) ?? contentText([s]))
        .filter(Boolean)
        .join("\n\n");
      const raw = sum || contentText(item.raw_content);
      if (!raw.trim()) return [];
      return [
        {
          type: "tool",
          toolId: `think-${id}`,
          name: "Pensando",
          summary: cut(raw.trim().split("\n")[0], 80),
          input: raw.trim(),
        },
      ];
    }
    case "CommandExecution": {
      const cmd = commandLine(item);
      const out = str(item.stdout) ?? str(item.output) ?? "";
      const status = str(item.status) ?? "";
      const exit = num(item.exit_code);
      return [
        {
          type: "tool",
          toolId: id,
          name: "Bash",
          summary: cut(cmd.replace(/\s+/g, " "), 120),
          input: cmd,
          ...(out ? { output: out.slice(0, 4000) } : {}),
          ...(status === "failed" || (exit != null && exit !== 0) ? { isError: true } : {}),
        },
      ];
    }
    case "FileChange": {
      const changes = obj(item.changes) ?? {};
      const paths = Object.keys(changes);
      const diff = paths
        .map((p) => {
          const c = obj(changes[p]);
          return `--- ${unfile(p)} (${str(c?.type) ?? "update"})\n${str(c?.unified_diff) ?? ""}`;
        })
        .join("\n\n");
      return [
        {
          type: "tool",
          toolId: id,
          name: "Edit",
          summary: cut(paths.map((p) => unfile(p).split("/").pop()).join(", "), 120),
          input: diff,
        },
      ];
    }
    case "ImageView": {
      const p = unfile(str(item.path));
      return [{ type: "tool", toolId: id, name: "Ver imagen", summary: p, input: p }];
    }
    case "WebSearch": {
      const q = str(item.query) ?? contentText(item.content);
      return [{ type: "tool", toolId: id, name: "Web Search", summary: cut(q, 120), input: q }];
    }
    case "TodoList": {
      const items = arr(item.items)
        .map((t) => {
          const o = obj(t);
          return `- [${o?.completed ? "x" : " "}] ${str(o?.text) ?? ""}`;
        })
        .join("\n");
      return [
        { type: "tool", toolId: id, name: "TodoWrite", summary: "actualiza el plan", input: items },
      ];
    }
    case "Error": {
      const text = str(item.message) ?? contentText(item.content);
      return text
        ? [{ type: "tool", toolId: id, name: "Error", summary: cut(text, 120), input: text, isError: true }]
        : [];
    }
    case "UserMessage":
    case "ContextCompaction":
      return []; // los maneja el recorrido de arriba (burbuja / chip)
    default: {
      // Un item que esta version de codex conoce y nosotros no: NO se inventa
      // nada, pero tampoco se esconde — se pinta como tool con su nombre y lo
      // que se le entienda. El invariante es "jamas mentir", no "jamas crecer".
      const text = contentText(item.content) || str(item.text) || "";
      return [
        {
          type: "tool",
          toolId: id,
          name: type || "item",
          ...(text ? { summary: cut(text.replace(/\s+/g, " "), 120), input: text } : {}),
        },
      ];
    }
  }
}

export function parseCodexTranscript(raw: string): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  let truncated = false;
  let model: string | undefined;
  let effort: string | undefined;
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let ctxPct: number | undefined;
  let turnWorking = false;
  let turnStartedAt: number | undefined;
  let turnLastEventAt: number | undefined;
  let outputTokens = 0;

  /** items en ORDEN DE APARICION, deduplicados por id (item_started →
   *  item_updated → item_completed reescriben el mismo). */
  const order: string[] = [];
  const byId = new Map<string, Obj>();

  for (let i = 0; i < lines.length; i++) {
    let ev: Obj;
    try {
      ev = JSON.parse(lines[i]) as Obj;
    } catch {
      if (i === 0) truncated = true; // el tail corto la primera linea
      continue;
    }
    const type = str(ev.type);
    const p = obj(ev.payload) ?? {};
    const ts = Date.parse(str(ev.timestamp) ?? "");
    if (!Number.isNaN(ts)) turnLastEventAt = ts;

    if (type === "session_meta") {
      sessionId = str(p.session_id) ?? str(p.id) ?? sessionId;
      cwd = str(p.cwd) ?? cwd;
      model = str(obj(p.collaboration_mode)?.model) ?? model;
      continue;
    }
    if (type === "turn_context") {
      // el ULTIMO manda: /model a mitad de sesion cambia de verdad
      model = str(p.model) ?? model;
      cwd = str(p.cwd) ?? cwd;
      const settings = obj(obj(p.collaboration_mode)?.settings);
      effort = str(settings?.reasoning_effort) ?? effort;
      continue;
    }
    if (type !== "event_msg") continue;

    const pt = str(p.type);
    if (pt === "task_started") {
      turnWorking = true;
      const at = num(p.started_at);
      turnStartedAt = at != null ? at * 1000 : (!Number.isNaN(ts) ? ts : turnStartedAt);
      outputTokens = 0;
      continue;
    }
    if (pt === "task_complete" || pt === "turn_aborted") {
      turnWorking = false;
      continue;
    }
    if (pt === "thread_settings_applied") {
      model = str(obj(p.thread_settings)?.model) ?? model;
      continue;
    }
    if (pt === "token_count") {
      const info = obj(p.info);
      const last = obj(info?.last_token_usage);
      const win = num(info?.model_context_window);
      const used = num(last?.total_tokens);
      if (used != null && win) ctxPct = Math.min(100, Math.round((used / win) * 100));
      const ot = num(last?.output_tokens);
      if (ot != null) outputTokens += ot;
      continue;
    }
    if (pt === "item_started" || pt === "item_updated" || pt === "item_completed") {
      const item = obj(p.item);
      if (!item) continue;
      const id = str(item.id) ?? `cx-${i}`;
      if (!byId.has(id)) order.push(id);
      byId.set(id, item);
      continue;
    }
  }

  // ── items → mensajes. Un UserMessage CIERRA el assistant abierto; todo lo
  //    demas se acumula en el mismo (igual que en claude: un turno del agente
  //    es prosa y herramientas intercaladas, no una burbuja por tool).
  const msgs: ChatMsg[] = [];
  let id = 1_000_000;
  let open: ChatMsg | null = null;
  for (let k = 0; k < order.length; k++) {
    const item = byId.get(order[k])!;
    const type = str(item.type) ?? "";
    if (type === "UserMessage") {
      open = null;
      const text = contentText(item.content);
      msgs.push({ id: id++, role: "user", text: text || "(sin texto)" });
      continue;
    }
    if (type === "ContextCompaction") {
      open = null;
      msgs.push({ id: id++, role: "user", sys: true, text: "contexto compactado" });
      continue;
    }
    const parts = partsForItem(item, k);
    if (!parts.length) continue;
    if (!open) {
      open = { id: id++, role: "assistant", text: "", parts: [] };
      msgs.push(open);
    }
    for (const part of parts) {
      const last = open.parts![open.parts!.length - 1];
      if (part.type === "text" && last?.type === "text") last.text += `\n\n${part.text}`;
      else open.parts!.push(part);
    }
  }

  // ¿la ultima respuesta (turno cerrado) termina preguntandote algo?
  let endsAsk = false;
  const lastMsg = msgs[msgs.length - 1];
  if (!turnWorking && lastMsg?.role === "assistant") {
    const parts = lastMsg.parts ?? [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
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
    effort,
    sessionId,
    cwd,
    ctxPct,
    truncated,
    turn: {
      state: turnWorking ? "working" : "done",
      startedAt: turnStartedAt,
      lastEventAt: turnLastEventAt,
      outputTokens,
      endsAsk,
    },
  };
}
