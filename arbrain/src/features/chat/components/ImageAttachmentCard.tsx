'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { ImageLightbox } from '@/shared/components/ImageLightbox'

// Miniatura cuadrada (1 oct 2026): el mismo estándar que las imágenes enviadas en el chat; el clic abre la completa.
export function ImageAttachmentCard({file,onRemove,compact=false}:{compact?:boolean;file:{name:string;content:string};onRemove?:()=>void}) {
  const [open,setOpen]=useState(false)
  return <div className="relative inline-flex max-w-full rounded-xl border border-border bg-card my-2">
    <button type="button" className="block p-2 text-left max-w-full" aria-label={`Abrir imagen ${file.name}`} onClick={()=>setOpen(true)}>
      <img src={file.content} alt={file.name} className={compact?"size-16 rounded-lg object-cover":"size-24 md:size-32 rounded-lg object-cover"}/>
      {!compact&&<span className="block text-xs text-muted truncate w-24 md:w-32 mt-1">{file.name}</span>}
    </button>
    {onRemove&&<button type="button" className="absolute top-1 right-1 rounded-full bg-card border border-border w-8 h-8 flex items-center justify-center" aria-label={`Quitar ${file.name}`} onClick={onRemove}><X size={16}/></button>}
    {open&&<ImageLightbox src={file.content} alt={file.name} onClose={()=>setOpen(false)}/>}
  </div>
}
