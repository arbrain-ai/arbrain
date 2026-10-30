'use client'
/**
 * Tiptap-based text editor overlay.
 *
 * The overlay is positioned over the canvas element at world coords,
 * transformed to screen space. While editing, the canvas renderer skips
 * drawing the element's text (see renderer/text.ts and engine).
 */
import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { useCanvasStore } from '../stores/canvas-store'
import { worldToScreen } from '../canvas/camera'
import { measureText } from '../canvas/renderer/text'
import { isShape, type TextElement, type StickyElement, type CanvasElement } from '../elements/types'
import { shapeTextBox } from '../elements/shape-text-box'
import { getPalette, type ThemeName } from '../theme/tokens'

interface Props {
  editingId: string
  onCommit: () => void
}

const BRAND_PURPLE = '#8B5CF6'

export function TiptapOverlay({ editingId, onCommit }: Props) {
  const elements = useCanvasStore(s => s.elements)
  const updateElement = useCanvasStore(s => s.updateElement)
  const camera = useCanvasStore(s => s.camera)
  const theme = useCanvasStore(s => s.theme)
  const palette = getPalette(theme === 'system' ? 'system' : (theme as ThemeName))
  const wrapperRef = useRef<HTMLDivElement>(null)
  const focusedEditingIdRef = useRef<string | null>(null)

  const element = elements.find(e => e.id === editingId)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, link: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      TextStyle,
      Color,
    ],
    content: getInitialContent(element),
    immediatelyRender: false,
    autofocus: false,
    onUpdate: ({ editor }) => {
      if (!element) return
      const json = editor.getJSON()
      const patch: Partial<CanvasElement> = { doc: json } as Partial<CanvasElement>
      if (element.type === 'text' && !element.containerId && element.autoSize) {
        const naturalHeight = naturalStandaloneTextHeight(element, json as TextElement['doc'])
        if (Math.abs(naturalHeight - element.height) > 1) {
          ;(patch as Partial<TextElement>).height = naturalHeight
        }
      }
      updateElement(element.id, patch)
    },
  })

  // Mirror element changes back to editor when remote update
  useEffect(() => {
    if (!editor || !element) return
    if (element.type !== 'text' && element.type !== 'sticky') return
    const current = editor.getJSON()
    const incoming = typeof element.doc === 'string' ? plainToDoc(element.doc) : element.doc
    if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming, { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element?.updatedAt])

  useEffect(() => {
    if (!editor || !element) return
    if (focusedEditingIdRef.current === editingId) return
    focusedEditingIdRef.current = editingId
    const frame = window.requestAnimationFrame(() => focusAtLastRealTextEnd(editor))
    return () => window.cancelAnimationFrame(frame)
  }, [editor, editingId, element])

  if (!element || (element.type !== 'text' && element.type !== 'sticky')) {
    return null
  }

  const container = wrapperRef.current?.parentElement
  const rect = container?.getBoundingClientRect()
  const viewport = rect ? { width: rect.width, height: rect.height } : { width: 0, height: 0 }
  const editBox = resolveEditBox(element, elements)
  const isStickyEl = element.type === 'sticky'
  const stickyColor = isStickyEl ? palette.stickyColors[(element as StickyElement).color] : null
  const textLike = element as TextElement | StickyElement
  const textAlign = textLike.textAlign ?? 'center'
  const verticalAlign = element.type === 'text'
    ? ((element as TextElement).verticalAlign ?? 'middle')
    : ((element as StickyElement).verticalAlign ?? 'middle')
  const fontSize = (textLike.fontSize ?? 16) * camera.zoom
  const lineHeight = element.type === 'text' ? ((element as TextElement).lineHeight ?? 1.35) : 1.35
  const visualEditBox = resolveVisualEditBox(element, editBox, lineHeight)
  const visualScreenPos = worldToScreen({ x: visualEditBox.x, y: visualEditBox.y }, camera, viewport)
  const visualScreenSize = {
    width: visualEditBox.width * camera.zoom,
    height: visualEditBox.height * camera.zoom,
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute z-40"
      style={{
        left: visualScreenPos.x,
        top: visualScreenPos.y,
        width: visualScreenSize.width,
        height: visualScreenSize.height,
        minHeight: visualScreenSize.height,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => {
        if (handleTaskShortcut(editor, e)) return
        if (e.key === 'Enter' && isAtEmptyListItem(editor)) {
          e.preventDefault()
          e.stopPropagation()
          editor?.commands.liftListItem('listItem') || editor?.commands.liftListItem('taskItem')
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCommit()
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit()
      }}
    >
      <div
        className="flex h-full rounded-md outline-none"
        style={{
          background: stickyColor?.bg ?? 'transparent',
          color: stickyColor?.text ?? (element as TextElement).textColor ?? palette.textColor,
          fontSize,
          fontFamily: fontStack(textLike.fontFamily ?? 'sans'),
          fontWeight: textLike.fontWeight ?? 400,
          fontStyle: textLike.fontStyle ?? 'normal',
          textDecoration: textLike.textDecoration ?? 'none',
          lineHeight,
          textAlign,
          alignItems: verticalAlign === 'middle' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
          justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
          padding: isStickyEl ? Math.max(10, 16 * camera.zoom) : 0,
          boxShadow: isStickyEl ? '0 4px 12px rgba(0,0,0,0.18)' : undefined,
        }}
      >
        <EditorContent
          editor={editor}
          className="draw3-tiptap-editor w-full min-w-0 outline-none [&_.ProseMirror]:min-h-[1.4em] [&_.ProseMirror]:w-full [&_.ProseMirror]:outline-none"
          style={{ textAlign }}
        />
        <style>{`
          .draw3-tiptap-editor .ProseMirror p {
            margin: 0;
          }

          .draw3-tiptap-editor .ProseMirror {
            caret-color: currentColor;
          }

          .draw3-tiptap-editor .ProseMirror ul,
          .draw3-tiptap-editor .ProseMirror ol {
            margin: 0;
            box-sizing: border-box;
            width: 100%;
            text-align: left;
          }

          .draw3-tiptap-editor .ProseMirror ul:not([data-type='taskList']),
          .draw3-tiptap-editor .ProseMirror ol {
            display: grid;
            row-gap: 0;
            padding-left: 0;
            list-style: none;
          }

          .draw3-tiptap-editor .ProseMirror ol {
            counter-reset: draw3-list-item;
          }

          .draw3-tiptap-editor .ProseMirror li {
            text-align: left;
          }

          .draw3-tiptap-editor .ProseMirror ul:not([data-type='taskList']) > li,
          .draw3-tiptap-editor .ProseMirror ol > li {
            display: grid;
            grid-template-columns: 1em minmax(0, 1fr);
            column-gap: 0.45em;
            align-items: start;
            min-height: 1.35em;
            padding-left: 0;
          }

          .draw3-tiptap-editor .ProseMirror ul:not([data-type='taskList']) > li::before {
            content: '•';
            grid-column: 1;
            grid-row: 1;
            display: block;
            width: 1em;
            height: 1.35em;
            line-height: 1.35em;
            text-align: center;
            color: currentColor;
          }

          .draw3-tiptap-editor .ProseMirror ol > li {
            counter-increment: draw3-list-item;
          }

          .draw3-tiptap-editor .ProseMirror ol > li::before {
            content: counter(draw3-list-item) '.';
            grid-column: 1;
            grid-row: 1;
            display: block;
            min-width: 1em;
            height: 1.35em;
            line-height: 1.35em;
            text-align: right;
            color: currentColor;
          }

          .draw3-tiptap-editor .ProseMirror ul:not([data-type='taskList']) > li > p,
          .draw3-tiptap-editor .ProseMirror ol > li > p {
            grid-column: 2;
            grid-row: 1;
            min-width: 0;
            min-height: 1.35em;
          }

          .draw3-tiptap-editor .ProseMirror ul:not([data-type='taskList']) > li > ul,
          .draw3-tiptap-editor .ProseMirror ul:not([data-type='taskList']) > li > ol,
          .draw3-tiptap-editor .ProseMirror ol > li > ul,
          .draw3-tiptap-editor .ProseMirror ol > li > ol {
            grid-column: 2;
            margin-top: 0;
          }

          .draw3-tiptap-editor .ProseMirror li p {
            margin: 0;
            text-align: left;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] {
            display: grid;
            row-gap: 0;
            list-style: none;
            padding-left: 0 !important;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li,
          .draw3-tiptap-editor .ProseMirror li[data-type='taskItem'] {
            display: grid !important;
            grid-template-columns: 1em minmax(0, 1fr);
            column-gap: 0.45em;
            align-items: start;
            width: 100%;
            min-height: 1.35em;
            padding-left: 0;
            list-style: none;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label,
          .draw3-tiptap-editor .ProseMirror li[data-type='taskItem'] > label {
            grid-column: 1;
            grid-row: 1;
            display: flex !important;
            align-items: center;
            justify-content: center;
            width: 1em;
            height: 1.35em;
            margin: 0;
            padding: 0;
            user-select: none;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > div,
          .draw3-tiptap-editor .ProseMirror li[data-type='taskItem'] > div {
            grid-column: 2;
            grid-row: 1;
            display: block;
            min-width: 0;
            min-height: 1.35em;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > div > p,
          .draw3-tiptap-editor .ProseMirror li[data-type='taskItem'] > div > p {
            min-height: 1.35em;
            margin: 0;
            text-align: left;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > ul,
          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > ol {
            grid-column: 2;
            margin-top: 0;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label + div {
            align-self: start;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label + div:empty::before {
            content: '';
            display: inline-block;
            min-height: 1.35em;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label + div,
          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label + div > p {
            line-height: 1.35;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label {
            transform: translateY(0.02em);
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label,
          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > div {
            min-height: 1.35em;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label input[type='checkbox'],
          .draw3-tiptap-editor .ProseMirror li[data-type='taskItem'] input[type='checkbox'] {
            width: 0.9em;
            height: 0.9em;
            margin: 0;
            accent-color: ${BRAND_PURPLE};
            cursor: pointer;
          }

          .draw3-tiptap-editor .ProseMirror ul[data-type='taskList'] > li > label input[type='checkbox'] + span,
          .draw3-tiptap-editor .ProseMirror li[data-type='taskItem'] input[type='checkbox'] + span {
            display: none;
          }
        `}</style>
      </div>
    </div>
  )
}

function resolveEditBox(element: TextElement | StickyElement, elements: CanvasElement[]) {
  if (element.type !== 'text' || !element.containerId) return element
  const container = elements.find(item => item.id === element.containerId)
  if (!container || !isShape(container)) return element
  return { ...element, ...shapeTextBox(container) }
}

function resolveVisualEditBox(
  element: TextElement | StickyElement,
  editBox: TextElement | StickyElement,
  lineHeight: number,
): Pick<TextElement | StickyElement, 'x' | 'y' | 'width' | 'height'> {
  if (element.type === 'sticky') return editBox
  if (element.containerId) return editBox

  const text = plainTextFromDoc(element.doc)
  const hardLineCount = Math.max(1, text.split('\n').length)
  const naturalHeight = Math.max(28, element.fontSize * lineHeight * hardLineCount)
  const height = element.autoSize
    ? Math.max(editBox.height, naturalHeight)
    : editBox.height
  const verticalAlign = element.verticalAlign ?? 'middle'
  const yOffset = verticalAlign === 'middle'
    ? Math.max(0, (editBox.height - height) / 2)
    : verticalAlign === 'bottom'
      ? Math.max(0, editBox.height - height)
      : 0

  return {
    x: editBox.x,
    y: editBox.y + yOffset,
    width: editBox.width,
    height,
  }
}

function naturalStandaloneTextHeight(element: TextElement, doc: TextElement['doc']) {
  const lineHeight = element.lineHeight ?? 1.4
  const text = plainTextFromDoc(doc)
  const measured = measureText(
    text || ' ',
    element.fontFamily,
    element.fontSize,
    element.fontWeight ?? 400,
    Math.max(8, element.width),
  )
  const lineCount = Math.max(1, measured.lines.length)
  return Math.max(
    element.fontSize * lineHeight,
    lineCount * element.fontSize * lineHeight + element.fontSize * 0.2,
  )
}

function fontStack(family: string): string {
  switch (family) {
    case 'serif': return 'ui-serif, Georgia, serif'
    case 'mono': return 'ui-monospace, Menlo, monospace'
    case 'handwriting': return '"Caveat", "Patrick Hand", cursive'
    case 'Noto Sans': return '"Noto Sans", system-ui, -apple-system, sans-serif'
    case 'Arial': return 'Arial, Helvetica, sans-serif'
    case 'Georgia': return 'Georgia, "Times New Roman", serif'
    case 'EB Garamond': return '"EB Garamond", Georgia, serif'
    case 'Abril Fatface': return '"Abril Fatface", Georgia, serif'
    case 'Bangers': return 'Bangers, Impact, fantasy'
    case 'Caveat': return 'Caveat, "Comic Sans MS", cursive'
    case 'Fredoka One': return '"Fredoka One", system-ui, sans-serif'
    case 'Graduate': return 'Graduate, Georgia, serif'
    case 'Gravitas One': return '"Gravitas One", Georgia, serif'
    case 'JetBrains Mono': return '"JetBrains Mono", ui-monospace, monospace'
    case 'Inter': return 'Inter, system-ui, -apple-system, sans-serif'
    case 'Montserrat': return 'Montserrat, system-ui, -apple-system, sans-serif'
    case 'Roboto Slab': return '"Roboto Slab", Georgia, serif'
    case 'Roboto Slab Black': return '"Roboto Slab", Georgia, serif'
    default: return 'system-ui, -apple-system, sans-serif'
  }
}

function getInitialContent(el?: CanvasElement) {
  if (!el) return ''
  const doc = (el as TextElement | StickyElement).doc
  if (!doc) return ''
  if (typeof doc === 'string') return plainToDoc(doc)
  return doc
}

function plainTextFromDoc(doc: TextElement['doc'] | StickyElement['doc']) {
  if (typeof doc === 'string') return doc
  if (!doc || typeof doc !== 'object') return ''
  return extractTextFromTiptapNode(doc)
}

function extractTextFromTiptapNode(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const typed = node as { type?: string; text?: string; content?: unknown[] }
  if (typed.type === 'text') return typed.text ?? ''
  if (typed.type === 'hardBreak') return '\n'
  if (!Array.isArray(typed.content)) return ''
  const separator = typed.type === 'paragraph' || typed.type === 'heading' ? '' : '\n'
  return typed.content.map(extractTextFromTiptapNode).join(separator)
}

function focusAtLastRealTextEnd(editor: Editor) {
  const { doc } = editor.state
  let fallback: number | null = null
  let target: number | null = null

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const end = pos + node.nodeSize - 1
    fallback = end
    if (node.textContent.trim().length > 0) target = end
    return false
  })

  const position = target ?? fallback ?? doc.content.size
  const safePosition = Math.max(1, Math.min(position, doc.content.size))
  const selection = TextSelection.create(doc, safePosition)
  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
  editor.view.focus()
}

function handleTaskShortcut(editor: Editor | null, event: KeyboardEvent<HTMLDivElement>) {
  if (!editor || event.key !== ' ') return false
  const { selection } = editor.state
  if (!selection.empty) return false

  const { $from } = selection
  if (!$from.parent.isTextblock) return false

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
  const match = textBefore.match(/^\s*\[( |x|X)?\]$/)
  if (!match) return false

  event.preventDefault()
  event.stopPropagation()

  const checked = match[1]?.toLowerCase() === 'x'
  const from = $from.pos - textBefore.length
  const to = $from.pos

  editor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .toggleTaskList()
    .updateAttributes('taskItem', { checked })
    .run()

  return true
}

function isAtEmptyListItem(editor: Editor | null) {
  if (!editor) return false
  const { selection } = editor.state
  if (!selection.empty) return false
  const { $from } = selection

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') continue
    return node.textContent.trim().length === 0
  }

  return false
}

function plainToDoc(text: string) {
  return {
    type: 'doc',
    content: text.split('\n').map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}
