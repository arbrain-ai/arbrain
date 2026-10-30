'use client'
import { File, FileCode, FileText, Download } from 'lucide-react'
import type { FileAttachmentMeta } from '../hooks/useChat'

export function FileAttachmentCard({ attachment }: { attachment: FileAttachmentMeta }) {
  const isText = attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/json'
  const isCode = /\.(ts|js|py|sh|css|html|xml|yaml|yml)$/i.test(attachment.filename)
  const Icon = isCode ? FileCode : isText ? FileText : File

  const sizeLabel = attachment.size
    ? attachment.size < 1024 ? `${attachment.size} B`
    : attachment.size < 1024 * 1024 ? `${(attachment.size / 1024).toFixed(1)} KB`
    : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
    : null

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.filename}
      className="flex items-center gap-2.5 mt-2 px-3 py-2 rounded-xl bg-code-bg border border-code-border hover:bg-card-active hover:border-primary/30 transition-all group/file"
    >
      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0 group-hover/file:bg-primary/20 transition-colors">
        <Icon size={15} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground/85 font-medium truncate">{attachment.filename}</p>
        {sizeLabel && (
          <p className="text-[10px] text-muted/80">{sizeLabel}</p>
        )}
      </div>
      <Download size={14} className="text-muted/60 group-hover/file:text-primary transition-colors shrink-0" />
    </a>
  )
}

