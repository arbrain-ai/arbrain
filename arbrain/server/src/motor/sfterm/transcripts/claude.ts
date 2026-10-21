// COPIA de sfterm/src/core/transcripts/claude.ts — no editar aquí: editar en SFTerm y correr scripts/sync-lector-sfterm.sh
// @ts-nocheck
/** EL PARSER DE CLAUDE CODE (~/.claude/projects/<slug>/<sesion>.jsonl).
 *
 *  PURO a proposito (cero imports a ipc): asi corre igual en la app y en
 *  `node --test` contra transcripts REALES. La IO (leer la cola del archivo)
 *  vive en `core/transcript.ts`; aqui solo se convierte texto en mensajes.
 *
 *  La sesion en disco ES la verdad: el `claude` que corre en una terminal
 *  escribe ahi cada turno, y el LECTOR (⌃Tab) la ESPEJA con cara de chat —
 *  solo lectura. Escribir siempre pasa por la terminal dueña (PTY vivo o
 *  --resume ahi mismo): una sola pluma por cuaderno.
 *
 *  Uno de los ADAPTADORES del registro `core/harness.ts` (hermanos:
 *  transcripts/codex.ts y transcripts/pi.ts). Los tres devuelven la MISMA
 *  `ParsedTranscript`, que es lo que hace que el lector sea agnostico.
 */
import {
  toolSummary,
  ctxPctFrom,
  type ChatMsg,
  type MsgImage,
  type ParsedTranscript,
  type Part,
} from "../msgs.js";

/** Slug de carpeta que usa Claude Code para agrupar sesiones por cwd. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/** Maquinaria de slash-commands en el jsonl → linea de SISTEMA sutil.
 *  undefined = no es maquinaria (prompt real) · null = descartar ·
 *  string = pintar como chip ("/model opus" · "Set model to Opus 4.8"). */
function fmtDurMs(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function sysLine(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t.startsWith("<")) return undefined;
  // aviso del harness al terminar un agente de fondo: NO es texto de Daniel —
  // se pinta como evento compacto (antes salia la burbuja con el XML crudo)
  if (t.startsWith("<task-notification>")) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(t)?.[1]?.trim() ?? "";
    const status = /<status>([^<]*)<\/status>/.exec(t)?.[1]?.trim();
    const tok = /<subagent_tokens>(\d+)<\/subagent_tokens>/.exec(t)?.[1];
    const dur = /<duration_ms>(\d+)<\/duration_ms>/.exec(t)?.[1];
    const nice = summary.replace(/^Agent "(.+)" finished$/, "Agente «$1» terminó")
      || "agente de fondo terminó";
    return [
      nice,
      dur ? fmtDurMs(+dur) : null,
      tok ? `↓${(+tok >= 1000 ? `${(+tok / 1000).toFixed(1)}k` : tok)} tokens` : null,
      status && status !== "completed" ? status : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const name = /<command-name>([^<]+)<\/command-name>/.exec(t);
  if (name) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t)?.[1]?.trim();
    return `${name[1].trim()}${args ? ` ${args}` : ""}`;
  }
  const out = /<local-command-std(?:out|err)>([\s\S]*?)<\/local-command-std(?:out|err)>/.exec(t);
  if (out) {
    // fuera ANSI ([1m etc) y saltos: es un chip de una linea
    const clean = out[1].replace(/\u001b?\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
    return clean ? clean.slice(0, 200) : null;
  }
  if (t.startsWith("<command-message>") || t.startsWith("<local-command")) return null;
  return undefined;
}

/** El prompt del chat pega los adjuntos al final ("Archivos adjuntos…"):
 *  separarlos para pintarlos como thumbnails/chips, no como texto crudo. */
function splitAttachments(text: string): { text: string; attachments?: string[] } {
  const m = /\n?\n?Archivos adjuntos \(leelos\/analizalos\):\n((?:- .+\n?)+)\s*$/.exec(text);
  if (!m) return { text };
  const attachments = m[1]
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
  return { text: text.slice(0, m.index).trim(), attachments };
}

/** Imagenes de UNA linea del jsonl, en ORDEN DE DOCUMENTO, con el hueco al que
 *  pertenecen: `slot` null = pegada por Daniel en el mensaje; `slot` = id de un
 *  tool_use = la devolvio ese tool_result (screenshot de Playwright y demas).
 *
 *  ⚠️ ESPEJO EXACTO de attach.rs::collect_images — content[] en orden y, dentro
 *  de un tool_result, su content[] en orden. El indice es el UNICO amarre entre
 *  los dos lados: cambiar el recorrido aqui sin cambiarlo alla hace que se abra
 *  una imagen distinta de la que se clickeo. Cuenta TODO bloque `image` aunque
 *  venga sin bytes (aqui SIEMPRE vienen sin bytes: readTail los stripeo). */
export function collectImages(
  message: Record<string, unknown> | undefined,
  uuid: string,
): Array<MsgImage & { slot: string | null }> {
  const out: Array<MsgImage & { slot: string | null }> = [];
  const content = message?.content;
  if (!Array.isArray(content)) return out;
  const push = (b: Record<string, unknown>, slot: string | null) => {
    const src = b.source as Record<string, unknown> | undefined;
    const mt = typeof src?.media_type === "string" ? src.media_type : "image/png";
    out.push({ uuid, index: out.length, mediaType: mt, slot });
  };
  for (const raw of content as Array<Record<string, unknown>>) {
    if (raw?.type === "image") {
      push(raw, null);
    } else if (raw?.type === "tool_result" && Array.isArray(raw.content)) {
      const slot = typeof raw.tool_use_id === "string" ? raw.tool_use_id : null;
      for (const ib of raw.content as Array<Record<string, unknown>>) {
        if (ib?.type === "image") push(ib, slot);
      }
    }
  }
  return out;
}

/** Tope de mensajes que se pintan. La ventana del tail subio a 4MB (ver
 *  readTail) y sin tope una sesion larga de puro texto pintaria miles de
 *  burbujas sin virtualizacion. 600 deja mas historia que la ventana vieja de
 *  1MB (~500) y protege el render. Recortar marca `truncated`: el lector avisa
 *  "inicio de la conversación fuera del espejo". */
const MAX_MSGS = 600;

/** Transcript jsonl → mensajes del chat. Ignora sidechains (subagentes),
 *  entradas meta y thinking. Los tool_result se pegan a su tool_use. */
export function parseTranscript(raw: string): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  const msgs: ChatMsg[] = [];
  // ids altos: no chocan con los de conversaciones reales (TTS usa el id)
  let id = 1_000_000;
  let title: string | undefined;
  let model: string | undefined;
  let effort: string | undefined;
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let truncated = false;
  let lastUsage: Record<string, unknown> | null = null;
  let open: ChatMsg | null = null; // assistant en curso (los tool_result no lo cierran)
  // pulso del turno: arranca en el ultimo prompt real; stop_reason lo cierra.
  // tool_use tambien lo ABRE (robusto cuando el tail corto el prompt inicial).
  let turnWorking = false;
  let turnStartedAt: number | undefined;
  let turnLastEventAt: number | undefined;
  // tokens por message.id (un mensaje API se parte en varias lineas jsonl con
  // el MISMO usage: contar por id evita duplicar)
  const tokByMsg = new Map<string, number>();

  const findTool = (toolUseId: string) => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const p = msgs[i].parts?.find(
        (pp): pp is Extract<Part, { type: "tool" }> =>
          pp.type === "tool" && pp.toolId === toolUseId,
      );
      if (p) return p;
    }
    return null;
  };

  const attachResult = (toolUseId: string, out: string, isError: boolean) => {
    const p = findTool(toolUseId);
    if (!p) return;
    p.output = out.slice(0, 4000);
    p.isError = isError;
  };

  /** Las imagenes que devolvio un tool_result cuelgan de SU bloque de tool
   *  (se ven al expandirlo), no de una burbuja: no las mando Daniel. */
  const attachToolImages = (imgs: Array<MsgImage & { slot: string | null }>) => {
    for (const img of imgs) {
      if (!img.slot) continue;
      const p = findTool(img.slot);
      if (!p) continue;
      (p.images ??= []).push({ uuid: img.uuid, index: img.index, mediaType: img.mediaType });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(lines[i]);
    } catch {
      if (i === 0) truncated = true; // el tail corto la primera linea
      continue;
    }
    const ts = typeof ev.timestamp === "string" ? Date.parse(ev.timestamp) : NaN;
    if (ev.isSidechain === true) {
      // los subagentes no se pintan, pero SI gastan tokens del turno
      if (ev.type === "assistant") {
        const m = ev.message as Record<string, unknown> | undefined;
        const u = m?.usage as Record<string, unknown> | undefined;
        if (u && typeof u.output_tokens === "number") {
          tokByMsg.set(typeof m?.id === "string" ? m.id : `sc-${i}`, u.output_tokens);
        }
        if (!Number.isNaN(ts)) turnLastEventAt = ts;
      }
      continue;
    }
    if (ev.isMeta === true) continue;
    if (typeof ev.sessionId === "string") sessionId = ev.sessionId;
    if (typeof ev.cwd === "string") cwd = ev.cwd;

    if (ev.type === "ai-title" && typeof ev.aiTitle === "string") {
      title = ev.aiTitle;
      continue;
    }
    if (ev.type !== "user" && ev.type !== "assistant") continue;
    const message = ev.message as Record<string, unknown> | undefined;
    if (!message) continue;

    if (ev.type === "assistant") {
      if (typeof message.model === "string") model = message.model;
      if (typeof ev.effort === "string") effort = ev.effort;
      if (message.usage && typeof message.usage === "object") {
        lastUsage = message.usage as Record<string, unknown>;
        const ot = (lastUsage as { output_tokens?: unknown }).output_tokens;
        if (typeof ot === "number") {
          tokByMsg.set(typeof message.id === "string" ? message.id : `l-${i}`, ot);
        }
      }
      if (!Number.isNaN(ts)) turnLastEventAt = ts;
      if (message.stop_reason === "tool_use") turnWorking = true;
      else if (typeof message.stop_reason === "string") turnWorking = false;
      if (!open) {
        open = { id: id++, role: "assistant", text: "", parts: [] };
        msgs.push(open);
      }
      const blocks = (Array.isArray(message.content) ? message.content : []) as Array<
        Record<string, unknown>
      >;
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") {
          const parts = open.parts!;
          const last = parts[parts.length - 1];
          if (last?.type === "text") last.text += b.text;
          else parts.push({ type: "text", text: b.text });
        } else if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) {
          // el "pensando por detras" VISIBLE (19 jul): bloque expandible con
          // la misma piel de un tool call (dot + resumen + detalle)
          open.parts!.push({
            type: "tool",
            toolId: `think-${i}-${open.parts!.length}`,
            name: "Pensando",
            summary: b.thinking.trim().split("\n")[0].slice(0, 80),
            input: b.thinking.trim(),
          });
        } else if (b.type === "tool_use" && typeof b.name === "string") {
          const input = (
            b.input && typeof b.input === "object" ? b.input : {}
          ) as Record<string, unknown>;
          open.parts!.push({
            type: "tool",
            toolId: typeof b.id === "string" ? b.id : `m-${id}`,
            name: b.name,
            summary: toolSummary(b.name, input),
            input: JSON.stringify(input, null, 2),
          });
        }
      }
      continue;
    }

    // user: prompt real (string/text) cierra el assistant; tool_result no
    const content = message.content;
    if (!Number.isNaN(ts)) turnLastEventAt = ts;
    if (typeof content === "string") {
      // maquinaria de slash-commands: chip de sistema, NO burbuja ni turno
      const sys = sysLine(content);
      if (sys !== undefined) {
        open = null;
        if (sys) msgs.push({ id: id++, role: "user", sys: true, text: sys });
        continue;
      }
      open = null;
      const ua = splitAttachments(content);
      msgs.push({
        id: id++,
        role: "user",
        text: ua.text || "(adjuntos)",
        ...(ua.attachments ? { attachments: ua.attachments } : {}),
      });
      turnWorking = true;
      if (!Number.isNaN(ts)) turnStartedAt = ts;
      tokByMsg.clear();
    } else if (Array.isArray(content)) {
      let userText = "";
      for (const b of content as Array<Record<string, unknown>>) {
        if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
          let out = "";
          if (typeof b.content === "string") out = b.content;
          else if (Array.isArray(b.content)) {
            out = (b.content as Array<Record<string, unknown>>)
              .map((x) => (x.type === "text" && typeof x.text === "string" ? x.text : ""))
              .join("\n");
          }
          attachResult(b.tool_use_id, out, b.is_error === true);
        } else if (b.type === "text" && typeof b.text === "string") {
          userText += (userText ? "\n" : "") + b.text;
        }
      }
      // IMAGENES de la linea (26 jul 2026). Las de tool_result cuelgan de su
      // bloque; las de arriba son las que Daniel pego en el TUI con ^V.
      const lineUuid = typeof ev.uuid === "string" ? ev.uuid : "";
      const allImgs = lineUuid ? collectImages(message, lineUuid) : [];
      attachToolImages(allImgs);
      const ownImgs: MsgImage[] = allImgs
        .filter((im) => !im.slot)
        .map((im) => ({ uuid: im.uuid, index: im.index, mediaType: im.mediaType }));
      // ⚠️ `|| ownImgs.length`: un mensaje que es SOLO imagen (pegar y enviar
      // sin escribir nada) no pintaba NADA — el mensaje entero desaparecia del
      // espejo porque no habia texto que empujar. Ahora la burbuja existe y
      // lleva su thumbnail.
      if (userText.trim() || ownImgs.length) {
        const sys = userText.trim() ? sysLine(userText) : undefined;
        if (sys !== undefined) {
          open = null;
          if (sys) msgs.push({ id: id++, role: "user", sys: true, text: sys });
        } else {
          open = null;
          const ua = splitAttachments(userText);
          msgs.push({
            id: id++,
            role: "user",
            text: ua.text || (ownImgs.length ? "" : "(adjuntos)"),
            ...(ua.attachments ? { attachments: ua.attachments } : {}),
            ...(ownImgs.length ? { images: ownImgs } : {}),
          });
          turnWorking = true;
          if (!Number.isNaN(ts)) turnStartedAt = ts;
          tokByMsg.clear();
        }
      }
    }
  }
  const ctxPct = lastUsage ? (ctxPctFrom(lastUsage, model) ?? undefined) : undefined;
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
  let outputTokens = 0;
  for (const v of tokByMsg.values()) outputTokens += v;
  // tope de render (ver MAX_MSGS): el recorte es del INICIO, lo ultimo siempre
  // se ve, y `truncated` hace que el lector lo diga en vez de mentir
  const shown = msgs.length > MAX_MSGS ? msgs.slice(-MAX_MSGS) : msgs;
  if (shown.length < msgs.length) truncated = true;
  return {
    msgs: shown, title, model, effort, sessionId, cwd, ctxPct, truncated,
    turn: {
      state: turnWorking ? "working" : "done",
      startedAt: turnStartedAt,
      lastEventAt: turnLastEventAt,
      outputTokens,
      endsAsk,
    },
  };
}
