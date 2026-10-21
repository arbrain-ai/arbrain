// COPIA de sfterm/src/core/transcripts/opencode.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** EL PARSER DE OPENCODE (~/.local/share/opencode/opencode.db, SQLite).
 *
 *  PURO, como sus hermanos: recibe TEXTO y devuelve `ParsedTranscript`. Quien
 *  saca ese texto de la base es el `readCommand` del harness (una consulta con
 *  `sqlite3 -readonly` que escupe JSONL) — asi este modulo sigue corriendo en
 *  `node --test` sin base de datos ni IPC.
 *
 *  ── EL FORMATO, MEDIDO (24 ago 2026, opencode 1.18.22, sesiones reales) ────
 *  opencode es el primero que NO guarda en archivos de texto: tres tablas.
 *    `session(id, directory, title, agent, tokens_*)`  — la tarjeta
 *    `message(id, session_id, time_created, data)`     — data = JSON del turno
 *    `part(id, message_id, session_id, data)`          — data = JSON del bloque
 *
 *  El `readCommand` los aplana a dos clases de linea, y esa forma es el
 *  contrato con este parser:
 *    {"k":"m","id":…,"t":…,"d":{role,modelID,providerID,tokens,time,path}}
 *    {"k":"p","id":…,"m":<id del mensaje>,"d":{type:"text"|"reasoning"|"tool"|
 *                                              "step-start"|"step-finish", …}}
 *
 *  Las PARTES llegan DESPUES de todos los mensajes (son dos SELECT), asi que se
 *  indexan por `m` y se cosen al final: leerlas en el orden en que llegan
 *  pintaria un turno sin bloques y luego bloques sin turno.
 *
 *  ⚠️ **SIN ctx%.** El `tokens.total` del mensaje SI es la ocupacion real
 *  (input + cache read + output + reasoning, verificado: 2100+4261+6+47=6414),
 *  pero la VENTANA del modelo no vive en la base — opencode la saca de
 *  models.dev en caliente. Sin ventana no hay porcentaje honesto: el chip se
 *  omite, igual que en pi. Inventar 200K repetiria el bug del 26 jul.
 */
import { type ChatMsg, type ParsedTranscript, type Part, type ToolPart } from "../msgs.js";

const MAX_MSGS = 600;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** El texto de un prompt de opencode llega entrecomillado cuando vino de
 *  `opencode run "…"` (el shell le deja las comillas). Se limpian solo si
 *  ENVUELVEN todo: recortar comillas internas cambiaria el mensaje. */
function limpiaPrompt(s: string): string {
  const t = s.trim();
  return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

interface Msg {
  id: string;
  t: number;
  d: Obj;
  parts: Obj[];
}

export function parseOpencodeTranscript(raw: string): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  let truncated = false;
  let model: string | undefined;
  let cwd: string | undefined;
  let sessionId: string | undefined;

  const orden: Msg[] = [];
  const porId = new Map<string, Msg>();
  const sueltas: Array<[string, Obj]> = []; // partes cuyo mensaje aun no vimos

  for (let i = 0; i < lines.length; i++) {
    let ev: Obj;
    try {
      ev = JSON.parse(lines[i]) as Obj;
    } catch {
      if (i === 0) truncated = true;
      continue;
    }
    const k = str(ev.k);
    if (k === "m") {
      const id = str(ev.id);
      const d = obj(ev.d);
      if (!id || !d) continue;
      const m: Msg = { id, t: num(ev.t) ?? 0, d, parts: [] };
      orden.push(m);
      porId.set(id, m);
      continue;
    }
    if (k === "p") {
      const mid = str(ev.m);
      const d = obj(ev.d);
      if (!mid || !d) continue;
      sueltas.push([mid, d]);
    }
  }
  // coser: las partes llegan en su propio SELECT, despues de los mensajes
  for (const [mid, d] of sueltas) porId.get(mid)?.parts.push(d);

  const msgs: ChatMsg[] = [];
  let id = 1_000_000;
  let open: ChatMsg | null = null;
  let lastEventAt: number | undefined;
  let outputTokens = 0;
  let working = false;

  for (const m of orden) {
    if (m.t) lastEventAt = m.t;
    const role = str(m.d.role) ?? "";
    // el modelo va en el mensaje del usuario (`model:{providerID,modelID}`) y
    // en el del assistant (planos): el ULTIMO que se vea manda
    const mm = obj(m.d.model);
    const prov = str(m.d.providerID) ?? str(mm?.providerID);
    const mid = str(m.d.modelID) ?? str(mm?.modelID);
    if (mid) model = prov && !mid.includes("/") ? `${prov}/${mid}` : mid;
    cwd = str(obj(m.d.path)?.cwd) ?? cwd;
    if (!sessionId) sessionId = str(m.d.sessionID);

    if (role === "user") {
      open = null;
      outputTokens = 0;
      working = true; // hasta que un assistant lo cierre
      const text = m.parts
        .filter((p) => str(p.type) === "text")
        .map((p) => str(p.text) ?? "")
        .join("\n")
        .trim();
      msgs.push({ id: id++, role: "user", text: limpiaPrompt(text) || "(sin texto)" });
      continue;
    }
    if (role !== "assistant") continue;

    const tok = obj(m.d.tokens);
    outputTokens += num(tok?.output) ?? 0;
    // `time.completed` ausente = el turno sigue en vuelo
    working = num(obj(m.d.time)?.completed) == null;

    if (!open) {
      open = { id: id++, role: "assistant", text: "", parts: [] };
      msgs.push(open);
    }
    for (const p of m.parts) {
      const t = str(p.type);
      if (t === "text") {
        const text = (str(p.text) ?? "").trim();
        if (!text) continue;
        const last = open.parts![open.parts!.length - 1];
        if (last?.type === "text") last.text += `\n\n${text}`;
        else open.parts!.push({ type: "text", text });
      } else if (t === "reasoning") {
        const think = (str(p.text) ?? "").trim();
        if (!think) continue;
        open.parts!.push({
          type: "tool",
          toolId: `think-${str(p.id) ?? open.parts!.length}`,
          name: "Pensando",
          summary: cut(think.split("\n")[0], 80),
          input: think,
        });
      } else if (t === "tool") {
        // la herramienta viene ENTERA en su parte: input, salida y estado. No
        // hay que casar ids con nada — a diferencia de codex y pi.
        const st = obj(p.state) ?? {};
        const input = obj(st.input) ?? {};
        const part: ToolPart = {
          type: "tool",
          toolId: str(p.callID) ?? str(p.id) ?? `oc-${open.parts!.length}`,
          name: str(p.tool) ?? "tool",
          summary: cut(
            (str(st.title) ?? str(input.command) ?? str(input.filePath) ?? "").replace(/\s+/g, " "),
            120,
          ),
          input: JSON.stringify(input, null, 2),
        };
        const out = str(st.output);
        if (out) part.output = out.slice(0, 4000);
        if (str(st.status) === "error") part.isError = true;
        open.parts!.push(part);
      }
      // step-start / step-finish son andamiaje del motor, no conversacion
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

  const shown = msgs.length > MAX_MSGS ? msgs.slice(-MAX_MSGS) : msgs;
  if (shown.length < msgs.length) truncated = true;
  return {
    msgs: shown,
    model,
    sessionId,
    cwd,
    truncated,
    turn: {
      state: working ? "working" : "done",
      lastEventAt,
      outputTokens,
      endsAsk,
    },
  };
}
