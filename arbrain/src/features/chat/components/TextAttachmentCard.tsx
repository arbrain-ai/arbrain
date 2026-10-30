'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, FileText, X } from 'lucide-react'
import { MAX_TEXT_CHARACTERS, presentUserText, type TextAttachment } from '../lib/text-attachments'
import styles from './text-attachment.module.css'

export function TextAttachmentCard({ file, onRemove, onChange }: { file: TextAttachment; onRemove?: () => void; onChange?: (content: string) => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <div className={styles.card}>
      <button type="button" className={styles.open} onClick={() => setOpen(true)} aria-label={`Abrir ${file.name}`}>
        <span className={styles.icon}><FileText size={21}/></span>
        <span className={styles.info}><strong>{file.name}</strong><small>TXT · {file.content.length.toLocaleString('es-MX')} caracteres</small></span>
      </button>
      {onRemove && <button type="button" className={styles.remove} aria-label={`Quitar ${file.name}`} onClick={onRemove}><X size={16}/></button>}
    </div>
    {open && createPortal(<TextViewer file={file} onClose={() => setOpen(false)} onChange={onChange}/>, document.body)}
  </>
}

function TextViewer({ file, onClose, onChange }: { file: TextAttachment; onClose: () => void; onChange?: (content: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  const [draft, setDraft] = useState(file.content)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const content = editing ? draft : file.content
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { previous?.focus() }
  }, [])
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopied(true); setError('') }
    catch { setError('No se pudo copiar. Puedes seleccionar el texto en esta ventana.') }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = file.name
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={title} onCancel={e => { e.preventDefault(); onClose() }}>
    <header className={styles.header}><FileText size={20}/><h2 id={title}>{file.name}</h2><button type="button" autoFocus aria-label="Cerrar texto" onClick={onClose}><X size={20}/></button></header>
    <div className={styles.toolbar}>
      <span>{content.length.toLocaleString('es-MX')} caracteres</span>
      <button type="button" onClick={() => { void copy() }}>{copied ? <Check size={16}/> : <Copy size={16}/>}<span>{copied ? 'Copiado' : 'Copiar'}</span></button>
      <button type="button" onClick={download}><Download size={16}/><span>Descargar</span></button>
      {onChange && !editing && <button type="button" onClick={() => setEditing(true)}>Editar</button>}
    </div>
    {editing ? <textarea data-scroll-region className={styles.editor} aria-label="Contenido del archivo" value={draft} onChange={e => { setDraft(e.target.value); setCopied(false) }}/>
      : <pre data-scroll-region tabIndex={0} className={styles.content}>{content}</pre>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {editing && draft.length > MAX_TEXT_CHARACTERS && <p role="alert" className={styles.error}>Máximo 100 000 caracteres. El texto no se ha recortado.</p>}
    {editing && <footer className={styles.footer}><button type="button" onClick={() => { setDraft(file.content); setEditing(false) }}>Cancelar edición</button><button type="button" disabled={draft.length > MAX_TEXT_CHARACTERS} onClick={() => { onChange?.(draft); setEditing(false) }}>Guardar texto</button></footer>}
  </dialog>
}

export function TextAttachmentTray({ files, onRemove, onChange }: { files: TextAttachment[]; onRemove?: (index: number) => void; onChange?: (index: number, content: string) => void }) {
  if (!files.length) return null
  return <div className={styles.tray} aria-label="Textos adjuntos">{files.map((file, i) => <TextAttachmentCard key={`${i}-${file.name}`} file={file} onRemove={onRemove ? () => onRemove(i) : undefined} onChange={onChange ? content => onChange(i, content) : undefined}/>)}</div>
}

export function UserMessageText({ text }: { text: string }) {
  const view = presentUserText(text)
  return <><TextAttachmentTray files={view.files}/>{view.text && <p className="whitespace-pre-wrap break-words">{view.text}</p>}</>
}
