/** Text stays verbatim. These are presentation containers, never a token-saving summary. */
export interface TextAttachment { name: string; content: string }
export const MAX_TEXT_CHARACTERS = 100_000
export const MAX_TEXT_FILES = 5

export function isLongText(text: string): boolean {
  return text.length >= 3000 || (text.length >= 800 && text.split('\n').length >= 30)
}

export function pastedTextFile(content: string, existing: ReadonlyArray<{ name: string }>): TextAttachment {
  let n = 1
  while (existing.some(f => f.name === `Texto pegado${n === 1 ? '' : ` ${n}`}.txt`)) n++
  return { name: `Texto pegado${n === 1 ? '' : ` ${n}`}.txt`, content }
}

export function textAttachmentError(files: readonly TextAttachment[]): string | null {
  if (files.length > MAX_TEXT_FILES) return 'Puedes adjuntar hasta cinco textos por mensaje.'
  if (files.some(f => f.content.length > MAX_TEXT_CHARACTERS)) return 'Cada texto puede tener hasta 100 000 caracteres. Divide el documento antes de adjuntarlo.'
  return null
}

// The four native chats already persist/retry the exact message. A length-framed
// text suffix travels through that same boundary, without a second upload or a
// metadata write that could race the turn. This is all user content, not system instructions.
const START = '[Archivo de texto adjunto · arbrain/v1 '
const END = '\n[Fin del archivo de texto adjunto]'
export function textMessageTitle(raw: string): string {
  const marker = raw.indexOf(START)
  return marker < 0 ? raw : raw.slice(0, marker).trim() || 'Texto adjunto'
}
export function copyableUserText(raw: string): string {
  const {text, files} = decodeTextAttachments(raw)
  return [text, ...files.map(f => f.content)].filter(Boolean).join('\n\n')
}
export function encodeTextAttachments(message: string, files: readonly TextAttachment[]): string {
  return [message, ...files.map(f => `${START}${JSON.stringify({ name: f.name, characters: f.content.length })}]\n${f.content}${END}`)].filter((part, i) => i > 0 || part !== '').join('\n\n')
}

export function decodeTextAttachments(raw: string): { text: string; files: TextAttachment[] } {
  const plain = { text: raw, files: [] as TextAttachment[] }
  const first = raw.startsWith(START) ? 0 : raw.indexOf(`\n\n${START}`)
  if (first < 0) return plain
  const text = first === 0 ? '' : raw.slice(0, first)
  let cursor = first === 0 ? 0 : first + 2
  const files: TextAttachment[] = []
  try {
    while (cursor < raw.length) {
      if (!raw.startsWith(START, cursor)) return plain
      const headerEnd = raw.indexOf(']\n', cursor + START.length)
      if (headerEnd < 0) return plain
      const meta = JSON.parse(raw.slice(cursor + START.length, headerEnd))
      if (typeof meta.name !== 'string' || !Number.isSafeInteger(meta.characters) || meta.characters < 0) return plain
      const begin = headerEnd + 2, end = begin + meta.characters
      if (!raw.startsWith(END, end)) return plain
      files.push({ name: meta.name, content: raw.slice(begin, end) })
      cursor = end + END.length
      if (cursor === raw.length) return { text, files }
      if (!raw.startsWith('\n\n', cursor)) return plain
      cursor += 2
    }
  } catch { /* A damaged/foreign frame remains visible as ordinary text. */ }
  return plain
}

/** Old long messages get a reversible display card; storage and model history stay untouched. */
export function presentUserText(raw: string): { text: string; files: TextAttachment[] } {
  const decoded = decodeTextAttachments(raw)
  return isLongText(decoded.text)
    ? { text: '', files: [{ name: 'Mensaje completo.txt', content: decoded.text }, ...decoded.files] }
    : decoded
}
