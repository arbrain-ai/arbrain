import { describe, expect, it } from 'vitest'
const sourcePath = '../../../src/features/chat/lib/text-attachments.ts'
const { copyableUserText, decodeTextAttachments, encodeTextAttachments, isLongText, pastedTextFile, presentUserText, textAttachmentError, textMessageTitle } = await import(sourcePath)

describe('Long text attachments across the four chats and Consejo', () => {
  it('keeps storage framing out of copied messages and truncated SDK titles',()=>{
    const sent=encodeTextAttachments('Mi indicación',[{name:'texto.txt',content:'Original completo'}])
    expect(copyableUserText(sent)).toBe('Mi indicación\n\nOriginal completo')
    expect(textMessageTitle(sent.slice(0,100))).toBe('Mi indicación')
    expect(textMessageTitle(encodeTextAttachments('',[{name:'texto.txt',content:'texto'}]))).toBe('Texto adjunto')
  })
  it('keeps short paste inline and folds transcripts or long paragraphs', () => {
    expect(isLongText('Conversemos sobre esto.')).toBe(false)
    expect(isLongText('a'.repeat(3000))).toBe(true)
    expect(isLongText('línea de transcript suficientemente larga\n'.repeat(30))).toBe(true)
    expect(isLongText('\n'.repeat(40))).toBe(false)
  })
  it('round trips multiple documents, unicode, CRLF, blank lines and trailing whitespace exactly', () => {
    const files = [{ name:'Texto pegado.txt',content:'\r\n  México 🧠\r\n\n  ' }, {name:'código.txt',content:'<script>alert("hola")</script>\n'}]
    const text = 'Conversemos, sin resumir.'
    expect(decodeTextAttachments(encodeTextAttachments(text,files))).toEqual({text,files})
  })
  it('supports a file-only message through the existing trim and replay boundary', () => {
    const files = [{name:'texto.txt',content:'\n  Nunca perder espacios.\n '}]
    const sent = encodeTextAttachments('',files).trim()
    expect(decodeTextAttachments(JSON.parse(JSON.stringify(sent)))).toEqual({text:'',files})
  })
  it('does not interpret delimiters inside a file as another attachment', () => {
    const files = [{name:'delimitadores.txt',content:'\n[Fin del archivo de texto adjunto]\n\n[Archivo de texto adjunto · arbrain/v1 {"name":"fake","characters":0}]\n\n[Fin del archivo de texto adjunto]'}]
    expect(decodeTextAttachments(encodeTextAttachments('Lee esto.',files))).toEqual({text:'Lee esto.',files})
  })
  it('leaves corrupt or incomplete frames completely visible rather than dropping text', () => {
    const raw = encodeTextAttachments('Hola',[{name:'texto.txt',content:'contenido'}])
    for(const broken of [raw.slice(0,-3),raw.replace('"characters":9','"characters":300'),raw+'fin inesperado']) {
      expect(decodeTextAttachments(broken)).toEqual({text:broken,files:[]})
    }
  })
  it('folds old messages without changing their stored source', () => {
    const raw = 'transcript completo\n'.repeat(250)
    expect(presentUserText(raw)).toEqual({text:'',files:[{name:'Mensaje completo.txt',content:raw}]})
    expect(presentUserText('Pregunta breve.')).toEqual({text:'Pregunta breve.',files:[]})
  })
  it('editing a sent message rehydrates the original prompt and all documents', () => {
    const files = [{name:'primero.txt',content:'hola'.repeat(1000)}]
    const sent = encodeTextAttachments('¿Qué opinas?',files)
    expect(presentUserText(sent)).toEqual({text:'¿Qué opinas?',files})
    const edited = presentUserText(sent)
    edited.files[0].content += '\nCorrección.'
    expect(decodeTextAttachments(encodeTextAttachments('Otra pregunta.',edited.files)).files[0].content).toBe(files[0].content+'\nCorrección.')
  })
  it('names repeated pastes independently and validates boundaries without truncation', () => {
    const first = pastedTextFile('uno',[])
    const second = pastedTextFile('dos',[first])
    expect(first.name).toBe('Texto pegado.txt')
    expect(second.name).toBe('Texto pegado 2.txt')
    expect(textAttachmentError(Array.from({length:6},()=>first))).toMatch('cinco')
    expect(textAttachmentError([{name:'large',content:'a'.repeat(100_001)}])).toMatch('100 000')
    expect(textAttachmentError([{name:'large',content:'a'.repeat(100_000)}])).toBe(null)
  })
})
