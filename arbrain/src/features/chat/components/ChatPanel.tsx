'use client'

import { FileAttachmentCard } from './FileAttachmentCard'
import { LevyFace } from './LevyFace'
import { Retrato } from '@/shared/components/Retrato'
import type { LiveChatController } from '@/features/live/controller'
import { useEffect, useLayoutEffect, useRef, useState, KeyboardEvent, useCallback, memo, startTransition, useMemo, type ReactNode } from 'react'
import { Plus, ArrowUp, AlertCircle, Copy, Check, Clock, ChevronDown, ImageIcon, X, ShieldAlert, Pencil, GitBranch, FileText, AlarmClock, BellRing, Sparkles, Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { tocaLeerAhora } from '@/shared/lib/reposo'
import { useAuth } from '@/hooks/useAuth'
import { DespertadoresAviso } from './DespertadoresAviso'
import { ChatDraftStatus } from './ChatDraftStatus'
import {ImageAttachmentCard} from './ImageAttachmentCard'
import { TextAttachmentTray, UserMessageText } from './TextAttachmentCard'
import { copyableUserText, decodeTextAttachments, encodeTextAttachments, isLongText, pastedTextFile, presentUserText, textAttachmentError, textMessageTitle, type TextAttachment } from '../lib/text-attachments'
import { clipboardImages, localImagePath, readPastedImage } from '../lib/image-paste'
import { esArchivoDeImagen, prepararImagen } from '../lib/image-prepare'
import { ErrorImagen, LIMITE_SUBIDA_BYTES, formatoBytes, mensajeFallosSubida, subirImagen, PERFIL_DATOS_MOVILES, PERFIL_NORMAL, type FalloSubida } from '../lib/image-upload'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import { ACCEPT_DOCUMENTOS, esDocumentoAceptado, esUrlDeDocumento, mensajePorDefecto, nombreDesdeUrl, separarAdjuntos, urlPublicaDeStorage } from '../lib/adjuntos'
import composerUI from './composer-ui.module.css'
import botonEnviar from './boton-enviar.module.css'
import {resizeComposer} from '../lib/composer-size'
import {useComposerDraft} from '../hooks/useComposerDraft'
import {composerDraftKey,composerDrafts} from '../lib/composer-drafts'
import { useChat, ChatMessage, ToolCall, TurnExtras } from '../hooks/useChat'
import { useChatHistory, ChatSession, PersistedMessage } from '../hooks/useChatHistory'
import { cacheSnapshot, getCachedSnapshot, isOnline } from '@/lib/local-first'
import { saveChatView, getChatView, dropChatView } from '../stores/chat-view-cache'
import { ChatSessions } from './ChatSessions'
import { useRecientesStore, recientes } from '../stores/recientes-store'
import dynamic from 'next/dynamic'
import { ImageLightbox, stripThinking } from './MarkdownMessage'
import { devolverAlComposer } from '../lib/fila-edicion'
import { ImagenRapida, useMetaImagen } from '@/shared/components/ImagenRapida'
import { esStorageOptimizable } from '@/lib/imagenes/variantes'
import { LazyMessage } from './LazyMessage'
import { useFueraDeVista } from '../hooks/useFueraDeVista'
import { deslizarScroll, fijarScroll } from '../lib/desplazar'
import { HiloSeguro } from './HiloSeguro'
import { curarHilo, despuesDePintar, medirHilo, reportarHilo } from '../lib/hilo-vigia'
import { vigilarRueda } from '../lib/rueda-vigia'
const MarkdownMessage = dynamic(
  () => import('./MarkdownMessage').then((m) => m.MarkdownMessage),
  { ssr: false }
)
import { AudioButton } from './AudioButton'
import { ChatSpeechBar } from './ChatSpeechBar'
import { chatSpeech } from '../lib/chat-speech'
import { LectorPosicion } from './LectorPosicion'
import { TtsProbeOverlay } from './TtsProbeOverlay'
import { VoiceInput } from './VoiceInput'
import { useLlaveVoz } from '../lib/voz-cliente'
import { MARCA_DESDE_MIC } from '@/features/primer-arranque/lib/llaves'
import { BotonReintentar } from './BotonReintentar'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { WaveformPlayer } from './WaveformPlayer'
import { GlobalAudioBar } from './GlobalAudioBar'
import { CommandPalette, iconoDeComando } from './CommandPalette'
import { comandoDeMensaje, filtrarComandos, pideArgumentos, textoRelleno } from '../lib/command-catalog'
import { useCommandCatalog } from '../hooks/useCommandCatalog'
import { useCommandStore } from '../stores/command-store'
import { ModelPicker } from './ModelPicker'
import { PuntoAutonomo } from '@/features/seguridad/components/PermisosEnModelo'
import { cabeEnConversacion, esModeloActual, type ModeloCatalogo } from '@/features/modelo/catalogo-modelos'
import { esEspacioClaude } from '@/shared/lib/espacios-chat'
import { EffortSlider, stopLabel, type EffortStop } from './EffortSlider'
import { CompactSeparator } from './CompactSeparator'
import { DateSeparator } from './DateSeparator'
import { NotasInyectadas } from './ToolCallCard'
import { LineaFija, Razonamiento } from './RastroTurno'
import { CambiosTurno } from './CambiosTurno'
import { ChipMeta, VueltasMeta } from './MetaTurno'
import { metaVigente, type EstadoMeta } from '../lib/meta'
import { separarRazonamiento } from '../lib/rastro'
import { CabinaDelMensaje, CabinaProvider } from '@/features/cabina/Cabina'
import { esHerramientaCabina } from '@/features/cabina/model'
import { chatArrancaNuevo } from '@/features/cabina/panel/telefono-pestanas'
import { AgentesTrabajando } from '@/features/cabina/panel/AgentesTrabajando'
import { useColaMensajes } from '../hooks/useColaMensajes'
import { hiloLimpio } from '../lib/hilo-limpio'
import { plegarInyectadas, puedeInyectar } from '../lib/inyecciones'
import { ordenarPorTurno } from '../lib/orden-turnos'
import { hayNoVisto } from '../lib/session-status'
import { EVENTO_CAMBIO_SESION, type CambioSesion } from '../lib/cambios-sesion'
import { fueAMano, olvidarAMano } from '../lib/no-leida-a-mano'
import { botonDelComposer, destinoDelEnvio, detenerArmado, GRACIA_DETENER_MS, repiteTurnoEnCurso } from '../lib/envio-chat'
import { ColaMensajes } from './ColaMensajes'
import { QuestionCards } from './QuestionCard'
import { TarjetasDelTurno } from './TarjetaComando'
import { ColaDelHilo } from '@/features/permisos/components/ColaDeAprobaciones'
import { HabitChecklist } from '@/features/sistema/components/HabitChecklist'
import { localDate } from '@/features/sistema/types'
import { ContextoChip, ContextoDetalle } from './ContextoChip'
import { contextoDeConversacion, detalleTurno } from '../lib/contexto-conversacion'
import { AudioProvider } from '../contexts/AudioContext'
import { modelDisplayName } from '../stores/model-store'
import { useAccountStore, toChatAccount, CHAT_TABS, bannerCuenta, type ChatTab } from '../stores/account-store'
import { usePreferenciaMotor } from '@/features/modelo/preferencia-store'
import { useCatalogoModelos } from '@/features/modelo/catalogo-store'
import { inicioDeChatNuevo, espacioVigente } from '@/features/modelo/modelo-inicial'
import { useChatPrefsStore } from '../stores/chat-prefs-store'
import { esEdicionCliente } from '@/lib/edicion'
import { NOMBRE_SIN_DAR, PEDIDOS_BIENVENIDA, soloBienvenida } from '@/features/primer-arranque/textos/bienvenida'
import { esFaltaLlave, esLlaveRechazada, turnoSinCredito } from '@/features/primer-arranque/lib/sin-saldo'
import { LlaveEnChat } from '@/features/primer-arranque/components/LlaveEnChat'
import { RecargaEnChat } from '@/features/primer-arranque/components/RecargaEnChat'
import { EVENTO_BORRADOR_CHAT } from '@/features/cabina/documento/comentarios'

const EDICION_CLIENTE = esEdicionCliente()

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      title="Copiar mensaje"
      aria-label="Copiar mensaje"
      className="flex items-center justify-center min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 p-2 md:p-0.5 rounded-lg md:rounded text-muted/60 hover:text-muted hover:bg-card-hover md:hover:bg-transparent transition-colors"
    >
      {copied ? <Check size={14} className="text-gold-dark dark:text-gold-bright" /> : <Copy size={14} />}
    </button>
  )
}

// El tercer botón del footer (📖 "Abrir en lector") murió el 15 jul 2026. Abría el mensaje
// en un overlay de texto plano para que el Speak Screen de iOS pudiera leerlo sin tragarse
// el sidebar y las tools. Era un parche de cuando no teníamos lectura propia: hoy el botón
// 🔊 lee el mensaje con la voz del dispositivo y resalta la palabra. Dos lectores para lo
// mismo era UX peor, no mejor. Se fueron con él ReaderOverlay y markdown-to-plaintext.

// ─── User image attachment (reuses lightbox from MarkdownMessage) ─────────────

// Miniaturas CUADRADAS fuera de la burbuja, alineadas a la derecha (1 oct 2026, Daniel: «no me gusta que se vean
// así rectangulares»). Antes iban dentro de la burbuja: una sola estiraba la burbuja a todo el ancho y varias
// quedaban en franjas panorámicas de 96 px de alto. El recorte cuadrado es solo la vista; el clic abre la imagen
// completa en el lightbox.
function UserImageAttachment({ src }: { src: string }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  // Support multiple URLs separated by newline (los documentos se pintan aparte, como tarjeta)
  const urls = separarAdjuntos(src).imagenes
  if (urls.length === 0) return null

  return (
    <>
      <div className="mb-1.5 flex max-w-[85%] md:max-w-[75%] flex-wrap justify-end gap-1.5">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightboxUrl(url)}
            aria-label={`Abrir imagen ${i + 1}`}
            className="group/img relative block size-24 md:size-32 shrink-0 overflow-hidden rounded-xl border border-border bg-card cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <MiniaturaAdjunta url={url} alt={`Imagen ${i + 1}`} />
            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover/img:opacity-100 transition-opacity text-foreground/85">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
              </span>
            </div>
          </button>
        ))}
      </div>
      {lightboxUrl && <ImageLightbox src={lightboxUrl} alt="Imagen adjunta" onClose={() => setLightboxUrl(null)} />}
    </>
  )
}

// Miniatura a su tamaño real (5 oct 2026): una foto de 4 MB del teléfono se pedía entera para un cuadro de 128 px.
// Si el adjunto vive en Storage, va la variante AVIF de 1x/2x con placeholder; si no, la URL tal cual.
function MiniaturaAdjunta({ url, alt }: { url: string; alt: string }) {
  const { meta } = useMetaImagen(esStorageOptimizable(url) ? { url } : null)
  const clase = 'size-full object-cover transition-transform duration-200 group-hover/img:scale-[1.03]'
  return meta
    ? <ImagenRapida meta={meta} alt={alt} ajuste="cover" lazy className={clase} />
    : <img src={url} alt={alt} className={clase} loading="lazy" />
}

// ─── Documentos enviados por el usuario (PDF, Word, Excel…) ──────────────────
function UserDocumentAttachments({ src }: { src: string }) {
  const docs = separarAdjuntos(src).documentos
  if (docs.length === 0) return null
  return (
    <div className="mb-1.5 flex w-full max-w-[85%] md:max-w-[75%] flex-col items-end gap-1">
      {docs.map((url, i) => (
        <div key={i} className="w-full max-w-72">
          <FileAttachmentCard attachment={{ url, filename: nombreDesdeUrl(url), mimeType: 'application/octet-stream' }} />
        </div>
      ))}
    </div>
  )
}

// Documento en la caja, antes de enviar.
function DocumentoPendiente({ nombre, bytes, onRemove }: { nombre: string; bytes?: number; onRemove: () => void }) {
  return (
    <div className="relative my-2 flex max-w-60 items-center gap-2 rounded-xl border border-border bg-card py-2 pl-2.5 pr-10">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10"><FileText size={16} className="text-primary" /></div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground/85">{nombre}</p>
        {bytes != null && <p className="text-[10px] text-muted/80">{formatoBytes(bytes)}</p>}
      </div>
      <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full border border-border bg-card" aria-label={`Quitar ${nombre}`} onClick={onRemove}><X size={16} /></button>
    </div>
  )
}

// «+» del composer: un menú con las dos formas de adjuntar.
function MenuAdjuntar({ disabled, onFotos, onDocumentos, onConsejo }: { disabled: boolean; onFotos: () => void; onDocumentos: () => void; onConsejo?: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  const elegir = (accion: () => void) => { setAbierto(false); accion() }
  const opcion = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground/90 hover:bg-card-hover focus:outline-none focus-visible:bg-card-hover'
  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        disabled={disabled}
        title="Adjuntar"
        aria-label="Adjuntar fotos o documentos"
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="icon-btn shrink-0 !size-11 md:!size-8 !rounded-full disabled:opacity-30"
      >
        <Plus size={17} className={`transition-transform duration-150 ${abierto ? 'rotate-45' : ''}`} />
      </button>
      {abierto && (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-xl border border-border bg-card p-1 shadow-xl">
          <button type="button" role="menuitem" className={opcion} onClick={() => elegir(onFotos)}>
            <ImageIcon size={16} className="shrink-0 text-primary" />
            <span>Fotos e imágenes</span>
          </button>
          <button type="button" role="menuitem" className={opcion} onClick={() => elegir(onDocumentos)}>
            <FileText size={16} className="shrink-0 text-primary" />
            <span className="flex flex-col"><span>Documentos</span><span className="text-[11px] text-muted">PDF, Word, Excel, CSV, texto</span></span>
          </button>
          {onConsejo && (
            <button type="button" role="menuitem" className={`${opcion} border-t border-border-subtle`} onClick={() => elegir(onConsejo)}>
              <Sparkles size={16} className="shrink-0 text-primary" />
              <span className="flex flex-col"><span>Pedir consejo a dos modelos</span><span className="text-[11px] text-muted">Claude + OpenAI</span></span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── File attachment card (non-audio files) ──────────────────────────────────

// ─── Message bubble ───────────────────────────────────────────────────────────
// Layout fase 2 paso 3 (modelo Claude iOS): el USER lleva burbuja neutra sutil a
// la derecha; el ASSISTANT es texto plano a TODO el ancho — sin caja y sin avatar
// por mensaje (la identidad de Levy vive en el header). Metadata (hora, copy,
// audio, usage) se revela on-hover en desktop y queda visible en móvil.

// Botón detener: ms para que "mantener presionado" dispare el rollback total.
// Debe coincidir con la duración de la animación .msg-stop-ring (globals.css).
const HOLD_STOP_MS = 1100

interface MessageBubbleProps {
  msg: ChatMessage
  /** true solo para mensajes recién llegados — dispara la animación de entrada */
  isFresh?: boolean
  onAnswerQuestion?: (requestId: string, answers: Record<string, string> | null) => Promise<boolean>
  /** texto del user msg anterior — habilita "Reintentar" en burbujas de error */
  retryText?: string
  onRetry?: (text: string) => void
  /** estado de la conexión del teléfono (no de la actividad del agente): solo importa mientras este mensaje sigue en vuelo */
  connection?: 'online' | 'offline' | 'reconnecting'
  /** editar este mensaje de user — rebobina la conversación a ese punto */
  onEdit?: (msg: ChatMessage) => void
}

export const MessageBubble = memo(function MessageBubble({ msg, isFresh = false, onAnswerQuestion, retryText, onRetry, onEdit, connection = 'online' }: MessageBubbleProps) {
  const isUser = msg.role === 'user'
  const isVoiceNote = isUser && !!msg.audioUrl
  const hasAssistantAudio = !isUser && !!msg.audioUrl

  // Detect slash commands
  const catalogoComandos = useCommandStore((s) => s.catalogo)
  const cmdMatch = isUser ? comandoDeMensaje(catalogoComandos, msg.content) : null
  const cmdIcono = cmdMatch ? iconoDeComando(cmdMatch) : null
  const cmdArgs = cmdMatch ? msg.content.trim().slice(cmdMatch.name.length).trim() : ''
  const isCommand = !!cmdMatch && !isLongText(msg.content) && !decodeTextAttachments(msg.content).files.length

  // El razonamiento fundido en `content` (sesiones CLI recargadas) va al rastro; aquí solo la respuesta.
  const respuesta = isUser ? '' : separarRazonamiento(msg).respuesta
  const time = msg.timestamp.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Strip "[Nota de voz]: " prefix for display
  const transcription = isVoiceNote
    ? msg.content.replace(/^\[Nota de voz\]:\s*/i, '').trim()
    : null

  // ── Chat vivo: el «mensaje» de un despertador lo escribió Levy para sí mismo, no Daniel ──
  if (isUser && msg.metadata?.origen?.tipo === 'despertador') {
    return (
      <div data-testid="despertador-disparado" className={`flex justify-center ${isFresh ? 'msg-enter' : ''}`}>
        <span className="inline-flex max-w-[85%] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted">
          <AlarmClock size={11} className="shrink-0 text-brand-ink" />
          <span className="truncate">{msg.metadata.origen.despertadorId?.startsWith('s-') ? 'Subagente' : 'Despertador'} · {msg.metadata.origen.etiqueta ?? msg.content}</span>
          <span className="text-muted/70">{time}</span>
        </span>
      </div>
    )
  }

  // ── USER: burbuja morada a la derecha (identidad Titaniumorphism) ──
  if (isUser) {
    // Solo imágenes, sin texto: no pintar una burbuja vacía bajo las miniaturas.
    const conBurbuja = isVoiceNote || isCommand || !!msg.content.trim() || !msg.imageUrl
    return (
      <div className={`group flex flex-col items-end ${isFresh ? 'msg-enter' : ''}`}>
        {msg.imageUrl && <UserImageAttachment src={msg.imageUrl} />}
        {msg.imageUrl && <UserDocumentAttachments src={msg.imageUrl} />}
        {/* v2: las acciones viven DEBAJO de la burbuja (como claude.ai); dentro dejaban
            una franja vacía bajo cada mensaje de una línea. */}
        {conBurbuja && <div className="max-w-[85%] md:max-w-[75%] min-w-0 overflow-hidden px-4 py-2.5 text-[15px] leading-relaxed msg-bubble-own rounded-br-md">
          {isVoiceNote && msg.audioUrl ? (
            <>
              <WaveformPlayer audioUrl={msg.audioUrl} messageId={msg.id} isUser />
              {transcription && (
                <div className="text-[11px] text-muted mt-1.5 leading-relaxed"><UserMessageText text={transcription}/></div>
              )}
            </>
          ) : isCommand && cmdMatch && cmdIcono ? (
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${cmdIcono.iconClass}`}>
                <cmdIcono.icon size={13} strokeWidth={1.75} />
              </div>
              <span className="font-mono font-semibold text-[13px] text-foreground">{cmdMatch.name}</span>
              {cmdArgs && <span className="text-[12px] text-muted min-w-0 break-words">{cmdArgs}</span>}
            </div>
          ) : (
            <UserMessageText text={msg.content}/>
          )}
        </div>}
        <div className="flex items-center justify-end mt-1 gap-1.5 pr-1 min-h-6 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
          {onEdit && !isVoiceNote && !isCommand && (
            <button
              onClick={() => onEdit(msg)}
              title="Editar mensaje (rebobina la conversación aquí)"
              aria-label="Editar mensaje"
              className="p-1 rounded-md text-muted/70 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <Pencil size={12} />
            </button>
          )}
          <CopyBtn text={copyableUserText(msg.content)} />
          <p className="text-[10px] text-muted/80">{time}</p>
        </div>
      </div>
    )
  }

  // ── ASSISTANT: texto plano a TODO el ancho (fase 2 paso 3, modelo Claude iOS:
  // cero avatar por mensaje — la identidad de Levy vive en el header) ──
  return (
    <div className={isFresh ? 'msg-enter' : ''}>
      {/* El TTS extrae solo data-tts-content; los controles de actividad
          permanecen accesibles para lectores de pantalla. */}
      {/* Un turno fallido NO tiñe de rojo lo que Levy sí alcanzó a escribir: el
          fallo vive en su propio aviso al pie (v2, 30 sep noche). */}
      <article className="group min-w-0 text-[15px] leading-relaxed">

        {msg.metadata?.origen?.tipo === 'espontanea' && (
          <div data-testid="despertar-espontaneo" className="flex items-center gap-1.5 mb-1.5">
            <span className="inline-flex max-w-full items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-[10px] font-medium text-muted">
              <BellRing size={10} className="shrink-0 text-brand-ink" />
              <span className="truncate">{msg.metadata.origen.etiqueta ?? 'Levy retomó por su cuenta'}</span>
            </span>
          </div>
        )}

        {msg.metadata?.source === 'cron' && (
          <div aria-hidden className="flex items-center gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-[10px] font-medium text-muted">
              <Clock size={10} />
              {msg.metadata.jobLabel ?? msg.metadata.jobId ?? 'Cron'}
            </span>
          </div>
        )}

        {/* «Razonamiento» (25 oct 2026, pedido del dueño): toggle simple ARRIBA de la respuesta, plegado. Al abrirlo, el razonamiento
            y las herramientas intercalados en orden real; mientras trabaja, su renglón es la línea viva + reloj. */}
        <Razonamiento msg={msg} connection={connection} />
        {/* Lo que el dueño escribió con el turno vivo es conversación, no auditoría: queda a la vista. */}
        {!msg.streaming && <NotasInyectadas notas={msg.inyectados} />}

        {/* La Cabina: las vistas nacen cuando Levy usa la herramienta, ANTES de
            redactar; por eso van arriba de su texto y su pregunta de cierre queda al final. */}
        {msg.toolCalls?.some(t => esHerramientaCabina(t.toolName)) && <CabinaDelMensaje msg={msg} />}

        {msg.metadata?.jobId === 'evening-reflection' ? (
          <HabitChecklist date={localDate(msg.timestamp)} />
        ) : msg.metadata?.reporteVivo && !msg.metadata.reporteConTexto && msg.toolCalls?.length ? null /* reportes de antes del 10 oct: viven en su vista (arriba); su texto largo queda para el push y el historial */
        : respuesta && !(msg.error && msg.diagnostic && respuesta.trim() === msg.diagnostic.trim()) ? (
          // Cursor ▍ pegado al final del texto mientras streamea (feel Claude) —
          // se inyecta en el markdown para quedar inline en el último nodo.
          // data-tts-content: el botón Escuchar lee ESTE DOM con la voz del dispositivo. Sin el razonamiento
          // fundido de las sesiones CLI (<!--thinking-->): ese va al rastro plegado.
          <div data-tts-content={msg.id}>
            <MarkdownMessage content={msg.streaming ? respuesta + ' ▍' : respuesta} streaming={!!msg.streaming} ancho />
          </div>
        ) : null}

        {/* La meta (27 oct 2026): las revisiones del `/goal` van plegadas DEBAJO de la respuesta; nunca la entierran. */}
        <VueltasMeta meta={msg.meta} streaming={!!msg.streaming} />

        {/* Ver y deshacer (27 oct 2026): el turno que cambió archivos CIERRA con una fila «Levy cambió 2 memorias y 1 skill · Ver cambios». */}
        {!msg.streaming && <CambiosTurno msg={msg} />}

        {msg.error && EDICION_CLIENTE && turnoSinCredito(msg) ? (
          // A/B ronda 2: sin crédito no es un error crudo, es el paso de recarga (el mismo del primer arranque).
          <RecargaEnChat onReintentar={retryText && onRetry ? () => onRetry(retryText) : undefined} />
        ) : msg.error && EDICION_CLIENTE && (esLlaveRechazada(msg) || esFaltaLlave(msg)) ? (
          // Humo 13 oct y prueba en Windows 22 oct: llave rechazada, o ni llave ni sesión → qué falta y el atajo a Ajustes › Llaves.
          <LlaveEnChat diagnostico={msg.diagnostic ?? ''} onReintentar={retryText && onRetry ? () => onRetry(retryText) : undefined} />
        ) : msg.error ? (
          <div role="status" className="chat-falla">
            <AlertCircle size={15} aria-hidden />
            <div>
              <b>{msg.diagnostic ? 'Este turno no terminó.' : 'No se completó.'}</b>
              {msg.diagnostic && <p>{msg.diagnostic}</p>}
              {retryText && onRetry && <button onClick={() => onRetry(retryText)} className="pg-boton">Reintentar</button>}
            </div>
          </div>
        ) : msg.diagnostic && (
          <p role="status" className="mt-2 text-sm leading-relaxed text-muted">
            {msg.diagnostic}
          </p>
        )}
        {msg.branch && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] italic text-muted/70"><GitBranch size={12} className="shrink-0" aria-hidden />Continuación desde un mensaje editado. El historial anterior se conserva.</p>
        )}

        {/* Botón Play (27 oct 2026, edición cliente): lo que Levy necesita que apruebes, en el hilo del turno vivo. */}
        {EDICION_CLIENTE && msg.streaming && <TarjetasDelTurno />}

        {/* Pregunta interactiva (AskUserQuestion): botones tocables */}
        {msg.questionPrompts && msg.questionPrompts.length > 0 && onAnswerQuestion && (
          <QuestionCards prompts={msg.questionPrompts} onAnswer={onAnswerQuestion} />
        )}

        {/* Reintentar en errores — reenvía el mensaje del user tal cual */}


        {/* Assistant audio attachment — rendered below text */}
        {hasAssistantAudio && msg.audioUrl && (
          <div className="mt-2">
            <WaveformPlayer audioUrl={msg.audioUrl} messageId={msg.id} isUser={false} />
          </div>
        )}
        {/* Non-audio file attachments — rendered as download cards */}
        {msg.fileAttachments?.filter((f) => !f.mimeType.startsWith('audio/')).map((attachment, i) => (
          <FileAttachmentCard key={i} attachment={attachment} />
        ))}

        {/* Sello de downgrade: el modelo que PEDISTE no fue el que RESPONDIÓ este
            turno (típicamente Fable declinó por seguridad y Opus contestó). Es
            señal, no chrome → siempre visible, no hover-gated como el usage. */}
        {!msg.streaming && msg.downgrade && (
          <div
            className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/10 text-amber-500/90 border border-amber-400/20"
            title={
              msg.downgrade.refusal
                ? `${modelDisplayName(msg.downgrade.from) ?? msg.downgrade.from} declinó por seguridad${msg.downgrade.category ? ` (${msg.downgrade.category})` : ''} — ${modelDisplayName(msg.downgrade.to) ?? msg.downgrade.to} respondió este turno.`
                : `${modelDisplayName(msg.downgrade.from) ?? msg.downgrade.from} no estaba disponible — ${modelDisplayName(msg.downgrade.to) ?? msg.downgrade.to} respondió este turno.`
            }
          >
            <ShieldAlert size={11} className="shrink-0" />
            <span>
              {modelDisplayName(msg.downgrade.from) ?? msg.downgrade.from}
              {' → '}
              {modelDisplayName(msg.downgrade.to) ?? msg.downgrade.to}
              {' · '}
              {msg.downgrade.refusal ? 'seguridad' : 'capacidad'}
            </span>
          </div>
        )}

        {/* Footer: acciones + usage + hora — hover en desktop, visible en móvil.
            Solo cuando el turno terminó (Claude no muestra chrome durante stream). */}
        {!msg.streaming && respuesta && (
          // Footer accionable NO va aria-hidden: los botones (Escuchar/Copiar/Lector)
          // deben ser alcanzables por VoiceOver — así Daniel puede abrir el lector
          // con el screen reader activo. El ruido no accionable (usage + hora) sí se
          // oculta al árbol de accesibilidad para no ensuciar la lectura.
          <div className="flex items-center mt-1 gap-1.5 opacity-60 active:opacity-100 focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
            {/* stripThinking: en sesiones CLI recargadas el thinking va fundido
                en content (<!--thinking-->). Copiar/escuchar/leer NO debe arrastrarlo. */}
            {/* «Escuchar» con la voz del dispositivo (Web Speech): sin llave, también en la edición cliente (21 oct 2026). */}
            <AudioButton messageId={msg.id} />
            {/* «Escuchar resumen» retirado del pie (30 oct 2026, pedido del dueño: no aportaba nada nuevo); la lógica sigue en resumen-hablado.ts. */}
            <CopyBtn text={stripThinking(msg.content)} />
            {/* Solo la hora (2 oct 2026): el contexto de la conversación vive en la barra de escribir y el
                desglose de ESTE turno (entrada, salida, duración, costo) aparece al pasar el cursor. */}
            <div aria-hidden className="flex items-center gap-1.5 ml-1">
              <p data-hora-turno title={detalleTurno(msg.usage) ?? undefined} className="text-[10px] text-muted/70 cursor-default whitespace-nowrap">{time}</p>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}, (prev, next) => {
  const p = prev.msg, n = next.msg
  return p.content === n.content
    && p.streaming === n.streaming
    && p.error === n.error
    && p.toolCalls === n.toolCalls
    && p.inyectados === n.inyectados
    && p.toolInputs === n.toolInputs
    && p.toolOutputs === n.toolOutputs
    && p.thinking === n.thinking
    && p.cronologia === n.cronologia
    && p.meta === n.meta
    && p.todos === n.todos
    && p.tasks === n.tasks
    && p.toolSummaries === n.toolSummaries
    && p.questionPrompts === n.questionPrompts
    && p.status === n.status
    && p.usage === n.usage
    && p.metadata?.startedAt === n.metadata?.startedAt
    && p.downgrade === n.downgrade
    && p.compact === n.compact
    && p.fila === n.fila
    && prev.connection === next.connection
    && prev.retryText === next.retryText
})

// ─── Magic-word highlight overlay ─────────────────────────────────────────────
// Renders the textarea content as a transparent ghost layer beneath, with
// "ultrathink" / "think harder" / "think hard" tinted with a rainbow gradient.
// The textarea itself uses `text-transparent` + visible caret so the user only
// sees the rendered overlay text. Selection still works because the textarea
// remains the actual input surface.

const MAGIC_WORDS_RE = /(\bultracode\b|\bultrathink\b|\bthink harder\b|\bthink hard\b)/gi

function hasUltrathink(input: string): boolean {
  return /\bultrathink\b/i.test(input)
}

// "ultracode" en el mensaje = ese turno entra al Workflow tool (orquestación
// multi-agente). Trigger nativo del Agent SDK 0.3.201 — violeta como en Claude Code.
function hasUltracodeWord(input: string): boolean {
  return /\bultracode\b/i.test(input)
}

// Stateless test (no /g flag) — safe to call without resetting lastIndex.
// Used to decide whether to activate the ghost-overlay technique. When the
// input has zero magic words we render a plain visible textarea, which avoids
// the scroll-desync class of bugs entirely (caret + text always in sync).
const MAGIC_WORDS_TEST = /\b(?:ultracode|ultrathink|think harder|think hard)\b/i
function hasAnyMagicWord(input: string): boolean {
  return MAGIC_WORDS_TEST.test(input)
}

function inferEffort(input: string): 'low' | 'medium' | 'high' | 'max' | undefined {
  if (/\bultrathink\b/i.test(input)) return 'max'
  if (/\bthink harder\b/i.test(input)) return 'high'
  if (/\bthink hard\b/i.test(input)) return 'medium'
  return undefined
}

function HighlightedInputOverlay({ value }: { value: string }) {
  if (!value) return null
  const parts = value.split(MAGIC_WORDS_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (MAGIC_WORDS_RE.test(part)) {
          // Reset regex state — split + test on the same global regex shares lastIndex
          MAGIC_WORDS_RE.lastIndex = 0
          // ultracode = violeta sólido (paridad con Claude Code CLI);
          // la familia ultrathink conserva el gradiente rainbow.
          if (/^ultracode$/i.test(part)) {
            return (
              <span key={i} className="font-semibold text-brand-ink">
                {part}
              </span>
            )
          }
          return (
            <span
              key={i}
              className="font-semibold bg-gradient-to-r from-pink-400 via-violet-400 via-cyan-400 to-amber-400 bg-clip-text text-transparent"
              style={{ backgroundSize: '200% 100%' }}
            >
              {part}
            </span>
          )
        }
        MAGIC_WORDS_RE.lastIndex = 0
        return <span key={i} className="text-foreground">{part}</span>
      })}
    </>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

// Página de historial: al abrir una sesión solo bajamos los últimos N mensajes
// (la sesión "Automatizaciones" acumula cientos = ~1.3MB si se baja completa).
// El resto se pagina hacia atrás bajo demanda.
// 30 (antes 60): página inicial estilo Claude iOS — payload y parseo a la
// mitad al abrir; el historial viejo entra por scroll-up (cursor `before`).
const MESSAGES_PAGE_SIZE = 30

/** Saludo de la hora local, como lo haría una persona (no «Hola» a las 11 p. m.). */
function saludoPorHora(d = new Date()) {
  const h = d.getHours()
  return h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

// Documento: se lee a memoria (mismo motivo que las imágenes) y se valida el peso; no se transforma.
async function prepararDocumento(file: File): Promise<File> {
  const nombre = file.name || 'documento'
  if (file.size > LIMITE_SUBIDA_BYTES) throw new ErrorImagen('demasiado-grande', `«${nombre}» pesa ${formatoBytes(file.size)} y el máximo es ${formatoBytes(LIMITE_SUBIDA_BYTES)}. Divídelo o exporta solo las páginas que necesitas.`)
  let bytes: ArrayBuffer
  try { bytes = await file.arrayBuffer() } catch { throw new ErrorImagen('ilegible', `No pude leer «${nombre}»: el sistema ya no lo tiene disponible. Vuelve a adjuntarlo.`) }
  if (bytes.byteLength === 0) throw new ErrorImagen('ilegible', `«${nombre}» está vacío. Revisa el archivo y vuelve a adjuntarlo.`)
  return new File([bytes], nombre, { type: file.type })
}

// `imagenesSubidas`: adjuntos que ya están en el storage (un mensaje de la fila que regresó a editarse). Salen
// tal cual, antes de las fotos nuevas, sin volver a subirse.
const EMPTY_CHAT_DRAFT={input:'',textFiles:[] as TextAttachment[],imageFiles:[] as File[],imagenesSubidas:[] as string[],editingMsgId:null as string|null}
export function ChatPanel({ headerAction, onConsejo, liveMode = false, onLiveController }: { headerAction?: ReactNode; onConsejo?: () => void; liveMode?: boolean; onLiveController?: (controller: LiveChatController) => void } = {}) {
  const { chatSessionsPanelOpen, closeChatSessionsPanel } = useLayoutStore()
  const { profile } = useAuth()
  // TEMPORAL (2026-07-08): espacio de cuenta (Tú ↔ bro-claude). Filtra el sidebar
  // y decide qué suscripción factura los turnos. Ver stores/account-store.
  const account = useAccountStore((s) => s.account)
  const setAccount = useAccountStore((s) => s.setAccount)
  // Pestaña Crons (2026-07-13): vista de solo-lectura sobre las sesiones de
  // cron jobs / procesos de fondo. No es un espacio de cuenta: no cambia qué
  // suscripción factura ni dónde nacen conversaciones nuevas.
  const [showCronsTab, setShowCronsTab] = useState(false)
  // Si Daniel apaga la pestaña Crons en Settings mientras la está viendo, la
  // vista vuelve sola a su espacio de cuenta (si no, el sidebar se queda en una
  // pestaña que ya no existe).
  const cronsTabEnabled = useChatPrefsStore((s) => s.cronsTabEnabled)
  useEffect(() => {
    if (!cronsTabEnabled) setShowCronsTab(false)
  }, [cronsTabEnabled])
  const history = useChatHistory(account, showCronsTab ? 'crons' : 'chats')
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  // Espejo en ref del activeSession para callbacks capturados por streams en vuelo.
  // BUG que esto mata (detectado 6 jul con el default de conversación nueva): el
  // closure de onSave dentro de sendMessage se captura ANTES de que handleSend
  // pre-cree la sesión → al terminar el stream, `activeSession` del closure seguía
  // null y creaba una SEGUNDA sesión (duplicada, sin mapping SDK). El ref siempre
  // lee el valor actual.
  const activeSessionRef = useRef<ChatSession | null>(null)
  useEffect(() => { activeSessionRef.current = activeSession }, [activeSession])

  // Slash commands — static, no network call needed
  const [paletteQuery, setPaletteQuery] = useState<string | null>(null)
  const [paletteSelectedIndex, setPaletteSelectedIndex] = useState(0)
  const catalogoComandos = useCommandCatalog(account)
  // Un solo filtro para la paleta y el teclado: así el índice seleccionado coincide.
  const comandosFiltrados = useMemo(
    () => (paletteQuery === null ? [] : filtrarComandos(catalogoComandos, paletteQuery)),
    [catalogoComandos, paletteQuery],
  )
  const [showModelPicker, setShowModelPicker] = useState(false)
  // Popover del slider de esfuerzo (escala unificada low→ultracode), anclado al
  // chip del composer. Lo abre el chip y el comando /effort.
  const [showEffortSlider, setShowEffortSlider] = useState(false)
  // Detalle del indicador de contexto de la barra de escribir (2 oct 2026).
  const [showContexto, setShowContexto] = useState(false)

  const handleSave = useCallback(
    async (userMsg: string, assistantMsg: string, extras: TurnExtras) => {
      // A QUÉ CONVERSACIÓN VA ESTE TURNO. El turno trae su destino desde que se
      // envió (extras.sessionId). Antes esto se resolvía aquí, AL FINAL, leyendo
      // "la conversación abierta" — y al terminar ya podías estar en otra: el
      // turno aterrizaba en la equivocada, o si habías saltado a una conversación
      // nueva (ref vacío) se creaba OTRA sesión con el mismo primer mensaje. Esos
      // eran los duplicados del historial al trabajar en paralelo. El ref queda
      // solo de red para turnos sin dueño explícito (inyección de cron, completion
      // en background), y crear sesión es el último recurso.
      const turnSessionId = extras.sessionId ?? activeSessionRef.current?.id ?? null

      // SDK-only ("sdk:*"): la verdad vive en el transcript del daemon — NO hay
      // filas en Supabase que escribir (intentarlo truena con el uuid y sin
      // resolve el ACK jamás dispara). Resolver sin guardar: el ACK significa
      // "estoy viendo el turno", no solo "lo guardé".
      if (turnSessionId?.startsWith('sdk:') || (!turnSessionId && activeSessionRef.current?.isSDKOnly)) return

      let destinoId = turnSessionId
      if (!destinoId) {
        const session = await history.createSession(userMsg)
        destinoId = session.id
        // Solo adoptar la sesión recién creada como la activa si el usuario sigue
        // sin ninguna abierta: si ya se movió a otra, cambiarle la vista debajo
        // de los pies sería peor que el bug que esto arregla.
        if (!activeSessionRef.current) {
          activeSessionRef.current = session
          setActiveSession(session)
        }
      }
      // Metadata del assistant: extras del turno (attachments, tasks, summaries,
      // preguntas, sugerencias, usage) — reconstruyen la conversación al recargar.
      const assistantMeta: Record<string, unknown> = {}
      // turnId en AMBAS filas: el índice único (metadata->>'turnId', role) hace
      // atómico el dedupe contra el guardado de respaldo del server.
      if (extras.turnId) assistantMeta.turnId = extras.turnId
      if (extras.fileAttachments?.length) assistantMeta.fileAttachments = extras.fileAttachments
      if (extras.tasks?.length) assistantMeta.tasks = extras.tasks
      if (extras.toolSummaries?.length) assistantMeta.toolSummaries = extras.toolSummaries
      if (extras.questionPrompts?.length) assistantMeta.questionPrompts = extras.questionPrompts
      if (extras.suggestions?.length) assistantMeta.suggestions = extras.suggestions
      if (extras.usage) assistantMeta.usage = extras.usage
      if (extras.downgrade) assistantMeta.downgrade = extras.downgrade
      // Tools expandibles: nombre + input + output por tool (ya capados por
      // useChat/daemon) para que la sesión recargada pueda expandir igual.
      if (extras.toolCalls?.length) assistantMeta.toolCalls = extras.toolCalls
      if (extras.toolInputs && Object.keys(extras.toolInputs).length > 0) assistantMeta.toolInputs = extras.toolInputs
      if (extras.toolOutputs && Object.keys(extras.toolOutputs).length > 0) assistantMeta.toolOutputs = extras.toolOutputs
      await history.saveMessages(destinoId, [
        { role: 'user', content: userMsg, audioUrl: extras.audioUrl, imageUrl: extras.imageUrl, metadata: extras.turnId ? { turnId: extras.turnId } : undefined },
        { role: 'assistant', content: assistantMsg, audioUrl: extras.assistantAudioUrl, metadata: Object.keys(assistantMeta).length > 0 ? assistantMeta : undefined },
      ])
    },
    [history],
  )

  // Refs y state declarados ANTES del useChat porque el callback onRestoreInput
  // (capturado por el hook) los necesita en scope.
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerKey=composerDraftKey(profile?.id??'','chat:'+account,activeSession?.id)
  const composerKeyRef=useRef(composerKey); composerKeyRef.current=composerKey
  const composerDraft=useComposerDraft(composerKey,EMPTY_CHAT_DRAFT)
  const {input,textFiles,imageFiles,imagenesSubidas,editingMsgId}=composerDraft.value
  const {input:setInput,textFiles:setTextFiles,imageFiles:setImageFiles,imagenesSubidas:setImagenesSubidas,editingMsgId:setEditingMsgId}=composerDraft.setters
  const restoreTextDraft = useCallback((raw: string) => {
    const presented = presentUserText(raw)
    const draft = textAttachmentError(presented.files) ? decodeTextAttachments(raw) : presented
    setInput(draft.text); setTextFiles(draft.files)
  }, [])
  // Edición de un mensaje pasado: id del mensaje de user que se está editando.
  // Al enviar, se rebobina la conversación a ese punto (fork del contexto SDK).
  // Botón detener de dos modos: mantener presionado llena un anillo en HOLD_STOP_MS
  // (módulo, coincide con .msg-stop-ring en globals.css) y dispara el rollback
  // total; soltar antes = pausa suave.
  const [holdingStop, setHoldingStop] = useState(false)
  const holdTimerRef = useRef<number | null>(null)
  const holdFiredRef = useRef(false)

  // Auto-resize único del composer: crece con el contenido hasta el cap de
  // 200px. overflow-y vive en hidden (globals.css) y SOLO se enciende al pegar
  // el cap — un textarea "scrolleable" por 1px de redondeo (zoom, scrollbars
  // clásicas de macOS) pintaba las barras moradas permanentes en desktop.
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    resizeComposer(el)
  }, [])

  // Re-wrap al redimensionar la ventana: con texto largo el cap/overflow deben
  // recalcularse o el contenido quedaría recortado sin scrollbar.
  useEffect(() => {
    const onResize = () => autoResizeTextarea()
    window.addEventListener('resize', onResize);window.visualViewport?.addEventListener('resize',onResize)
    return () => {window.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('resize',onResize)}
  }, [autoResizeTextarea])

  useLayoutEffect(()=>{autoResizeTextarea()},[input,activeSession?.id,autoResizeTextarea])

  // Deep-link AI-first (?draft=): otras superficies (ej. sala Acciones del
  // Artificial Brain) prellenan el input con un prompt para Levy. Daniel lo
  // revisa/completa y manda — NUNCA se auto-envía.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const draft = params.get('draft')
    if (!draft) return
    restoreTextDraft(draft)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      autoResizeTextarea()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [autoResizeTextarea])

  // Comentarios del Documento en la edición cliente (30 oct 2026): llegan como borrador a la caja; nunca se envían solos.
  useEffect(() => {
    const alBorrador = (e: Event) => {
      const texto = (e as CustomEvent<string>).detail
      if (typeof texto !== 'string' || !texto) return
      restoreTextDraft(texto)
      requestAnimationFrame(() => { const el = textareaRef.current; if (!el) return; el.focus(); autoResizeTextarea(); el.setSelectionRange(el.value.length, el.value.length) })
    }
    window.addEventListener(EVENTO_BORRADOR_CHAT, alBorrador)
    return () => window.removeEventListener(EVENTO_BORRADOR_CHAT, alBorrador)
  }, [restoreTextDraft, autoResizeTextarea])

  // Ancla de turno estilo Claude iOS: al enviar, tu mensaje queda ARRIBA del
  // viewport y un spacer reserva la pantalla para la respuesta. Declarados aquí
  // (antes de onRestoreInputCb y handleSelectSession, que los capturan).
  const turnSpacerRef = useRef<HTMLDivElement>(null)
  const anchorPendingRef = useRef(false)                    // "acabo de enviar → anclar pre-paint"
  const anchorActiveRef = useRef(false)                     // spacer vivo para el último turno

  // Callback invocado por useChat cuando ESC durante streaming hace rollback del turno.
  // Restaura el texto del user al textarea + focus + cursor al final + auto-resize.
  // Pattern Claude Code CLI: el user ve el texto como si nunca hubiera enviado.
  const onRestoreInputCb = useCallback((text: string) => {
    // ESC rollback / rewind: el turno desaparece — el ancla y su spacer también.
    anchorActiveRef.current = false
    anchorPendingRef.current = false
    restoreTextDraft(text)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      autoResizeTextarea()
      el.setSelectionRange(text.length, text.length)
    })
  }, [autoResizeTextarea])

  const { changeEffort, connection, messages, loading, despachando, ocupado, inyectar, turnoInyectable, sendMessage, resumeStream, loadMessages, prependMessages, clearMessages, restoreMessages, appendMessage, stopStreaming, pauseStreaming, detachStream, currentModel, currentEffort, ultracode, removeMessages, suggestions, answerQuestion } = useChat({
    sessionId: activeSession?.id,
    liveWorkspace: liveMode,
    onSave: handleSave,
    onRestoreInput: onRestoreInputCb,
    // Guard del resume: la sesión que se va a reenganchar debe seguir siendo la
    // activa en ESTE momento (no la del render en que arrancó el resume).
    isSessionActive: useCallback((sid: string) => activeSessionRef.current?.id === sid, []),
    // El header del chat lee el modelo del MOTOR de este espacio (Claude o Codex).
    account,
    pendingCreation: activeSession?.pendingCreation ?? false,
    // Stop con mensajes inyectados sin leer: a la fila en pausa (la fila se declara más abajo; el ref la alcanza).
    onInyeccionSinLeer: useCallback((textos: string[]) => devolverEnPausaRef.current(textos), []),
  })
  const devolverEnPausaRef = useRef<(textos: string[]) => void>(() => {})

  // La lista lateral muestra UN hilo de reportes. Los crons escriben al hilo
  // «Automatizaciones» vigente (favorito); los duplicados viejos de migraciones se
  // ocultan de la lista sin borrarse (siguen en la base y en Buscar).
  const sesionesDeLista = useMemo(() => {
    let visto = false
    return history.sessions.filter(x => { if (x.title !== 'Automatizaciones') return true; if (visto) return false; visto = true; return true })
  }, [history.sessions])

  // ── La fila: lo que escribes mientras Levy trabaja (ver useColaMensajes) ──
  const cola = useColaMensajes(`${account}:${activeSession?.id ?? 'nueva'}`)
  devolverEnPausaRef.current = cola.devolverEnPausa
  const detencionManualRef = useRef(false)   // TÚ detuviste el turno: la fila no sale sola
  const enviarYaRef = useRef(false)          // «Enviar ya»: detener y mandar la fila
  const soltarFilaRef = useRef<() => void>(() => {})  // handleSend la llama; se define abajo
  // Un envío con fotos ya salió de la caja pero aún sube: cuenta como «Levy ocupado».
  const enviandoRef = useRef(false)
  // Gracia del botón detener tras enviar (ver GRACIA_DETENER_MS).
  const ultimoEnvioRef = useRef(0)
  const [detenerListo, setDetenerListo] = useState(true)
  const marcarEnvioRef = useRef<() => void>(() => {})

  // ── Edición de mensajes ──
  // Toca ✎ en un mensaje tuyo → su texto va al input y entras en modo edición.
  // Callback estable (lee la sesión de un ref) para no invalidar el memo de las
  // burbujas. La submisión la gatea handleSend (bloqueada mientras `loading`).
  const handleStartEdit = useCallback((msg: ChatMessage) => {
    if (activeSessionRef.current?.isSDKOnly) return
    setEditingMsgId(msg.id)
    restoreTextDraft(msg.content)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      autoResizeTextarea()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [autoResizeTextarea])

  const handleCancelEdit = useCallback(() => {
    setEditingMsgId(null)
    setInput(''); setTextFiles([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.overflowY = ''   // vuelve al hidden del CSS
    }
  }, [])

  // ── Botón detener de dos modos ──
  // Mantener presionado ≥ HOLD_STOP_MS = rollback total (paridad ESC, para móvil
  // sin teclado). Soltar antes = pausa suave (congela el parcial, conserva el turno).
  const startHoldStop = useCallback(() => {
    // Recién enviado, el botón detener ocupa el lugar del de enviar: un doble clic no detiene.
    if (!detenerArmado(ultimoEnvioRef.current, Date.now())) { holdFiredRef.current = true; return }
    holdFiredRef.current = false
    setHoldingStop(true)
    holdTimerRef.current = window.setTimeout(() => {
      holdFiredRef.current = true
      setHoldingStop(false)
      holdTimerRef.current = null
      detencionManualRef.current = true
      stopStreaming()
    }, HOLD_STOP_MS)
  }, [stopStreaming])

  const endHoldStop = useCallback(() => {
    setHoldingStop(false)
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
      if (!holdFiredRef.current) { detencionManualRef.current = true; pauseStreaming() }
    }
  }, [pauseStreaming])

  // Cancelar edición al cambiar de sesión; limpiar el timer de hold al desmontar.
  const draftScope = useRef({ session: activeSession?.id, account })
  useEffect(() => {
    if (draftScope.current.session === activeSession?.id && draftScope.current.account === account) return
    draftScope.current = { session: activeSession?.id, account }
  }, [activeSession?.id, account])
  useEffect(() => () => { if (holdTimerRef.current != null) clearTimeout(holdTimerRef.current) }, [])

  // Espejo de `loading` para leerlo sin stale closures dentro de callbacks async
  const chatLoadingRef = useRef(false)
  useEffect(() => { chatLoadingRef.current = loading }, [loading])

  // Espejos de messages/suggestions para el snapshot de unmount (chat-view-cache)
  // y para guards en callbacks async — sin re-crear closures por cada delta.
  const messagesRef = useRef<ChatMessage[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const suggestionsRef = useRef<string[]>([])
  useEffect(() => { suggestionsRef.current = suggestions }, [suggestions])

  // (El seed de modelo/esfuerzo vive en useChat, keyed por la sesión abierta:
  // los overrides son POR CONVERSACIÓN — chat_overrides en el daemon.)

  const bottomRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  const chatAreaRef = useRef<HTMLDivElement>(null)
  // Anchos del chat (globals.css · .chat-area): el ancho útil del hilo, sin la
  // barra de scroll, se publica como --chat-w para que la prosa, el composer y
  // el carril ancho se calculen sobre el espacio real (sidebar abierto o no).
  useLayoutEffect(() => {
    const hilo = messagesContainerRef.current, area = chatAreaRef.current
    if (!hilo || !area || typeof ResizeObserver === 'undefined') return
    const medir = () => area.style.setProperty('--chat-w', `${hilo.clientWidth}px`)
    medir()
    // El hilo cambia de alto cuando el composer crece al escribir: si hay una lectura en voz
    // alta, la frase activa se recoloca dentro de la zona que sigue visible.
    let altoPrevio = hilo.clientHeight
    const ro = new ResizeObserver(() => {
      medir()
      if (hilo.clientHeight !== altoPrevio) { altoPrevio = hilo.clientHeight; chatSpeech?.reajustar() }
    })
    ro.observe(hilo)
    return () => ro.disconnect()
  }, [])
  const isAtBottomRef = useRef(true)
  const hasAutoLoaded = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  // Paginación de historial
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const hasMoreRef = useRef(false)
  const loadingOlderRef = useRef(false)
  const oldestLoadedRef = useRef<string | null>(null)      // created_at crudo del mensaje más viejo cargado
  const selectSeqRef = useRef(0)                            // guard contra switches rápidos de sesión
  const pinToBottomRef = useRef(false)                      // "acabo de cargar sesión → pin al fondo pre-paint"
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null)
  const restoreScrollRef = useRef<number | null>(null)      // scrollTop exacto a restaurar (caché en memoria)
  // Id de la sesión restaurada desde el caché en memoria. Marca IDEMPOTENTE, no
  // flag consumible: el double-invoke de StrictMode re-corre los efectos y un
  // one-shot que se limpia en la 1a pasada deja a la 2a forzando el fondo.
  const restoredSessionIdRef = useRef<string | null>(null)
  const lastScrollTopRef = useRef(0)                        // último scrollTop conocido (los DOM refs ya son null en el cleanup de unmount)
  // Deep-link a MENSAJE (&msg= del push de un cron): al cargar la sesión,
  // aterrizar en el INICIO de ese mensaje (no en el fondo) con un highlight
  // breve para que el ojo sepa dónde caer. El ref NO se consume si el mensaje
  // aún no está en la página pintada (cache stale) — la página fresca re-corre
  // el layout effect y ancla entonces.
  const scrollToMsgRef = useRef<string | null>(null)
  // Candado post-anclaje: el ancla se aplica cuando el DOM del mensaje existe
  // pero ANTES de que markdown/gráficas pinten su altura real — el contenido
  // crece después y (a) desplaza el target, (b) el scroll clampeado hacía creer
  // al handler que estabas "al fondo" y el chase-bottom pisaba el ancla.
  // Mientras el candado vive, cada resize del contenido RE-ancla al target y el
  // tracking de atBottom se congela. Se suelta al primer gesto del usuario
  // (wheel/touch) o al expirar.
  const anchorLockRef = useRef<{ id: string; until: number } | null>(null)
  // El streaming NUNCA mueve la pantalla (1 oct 2026, Daniel: «si estoy leyendo me mueve… o si quiero tomar una
  // captura»). Deroga el modo seguimiento del 20 jul: la respuesta crece debajo del fold y el botón ↓ te lleva.
  // Única excepción: los primeros instantes tras abrir una conversación con un turno vivo, mientras el markdown
  // monta async y el «fondo» todavía se mueve solo. Un gesto del usuario (wheel/touch) suelta esa ventana.
  const pinSettleUntilRef = useRef(0)
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)

  const setHasMore = useCallback((v: boolean) => {
    hasMoreRef.current = v
    setHasMoreHistory(v)
  }, [])
  const pendingImages=useMemo(()=>imageFiles.map(file=>({file,previewUrl:URL.createObjectURL(file)})),[imageFiles])
  useEffect(()=>()=>{pendingImages.forEach(image=>URL.revokeObjectURL(image.previewUrl))},[pendingImages])
  const [uploadingImage, setUploadingImage] = useState(false)
  // Imágenes que se están leyendo/reduciendo en el navegador antes de entrar al borrador. El envío espera a que terminen.
  const [preparingImages, setPreparingImages] = useState(0)
  const preparacionRef = useRef<Promise<void>>(Promise.resolve())
  const preparandoRef = useRef(0)
  const [chatError, setChatError] = useState<string | null>(null)
  const MAX_IMAGES = 10

  // Ghost overlay activates only when the user typed a magic word (ultrathink /
  // think harder / think hard). Outside that case the textarea renders normally
  // — caret + glyphs share the same scroll position, no desync possible.
  const showOverlay = !!input && hasAnyMagicWord(input)

  // When the overlay IS active and content overflows max-h, the browser auto-
  // scrolls the textarea to keep the caret visible. The native `scroll` event
  // catches most of that via onScroll, but on iOS Safari the event sometimes
  // doesn't fire for keyboard-driven scroll. This belt-and-suspenders sync runs
  // after every input change in the same paint frame as the layout, then once
  // more on the next animation frame (after the browser settled the caret).
  useLayoutEffect(() => {
    if (!showOverlay) return
    const ta = textareaRef.current
    const ov = overlayRef.current
    if (!ta || !ov) return
    ov.scrollTop = ta.scrollTop
    const raf = requestAnimationFrame(() => { ov.scrollTop = ta.scrollTop })
    return () => cancelAnimationFrame(raf)
  }, [input, showOverlay])

  // Los avisos largos (causa + qué hacer) necesitan más de 5 s para leerse.
  const showChatError = useCallback((msg: string, ms = 5000) => {
    setChatError(msg)
    setTimeout(() => setChatError((curr) => (curr === msg ? null : curr)), ms)
  }, [])

  // Spacer dinámico estilo Claude iOS: al enviar, el último turno (tu mensaje +
  // la respuesta creciendo) tiene reservada una pantalla completa. El spacer
  // decrece 1:1 conforme la respuesta crece → scrollHeight constante → cero
  // saltos. Si la respuesta rebasa el viewport, sigue debajo del fold SIN
  // arrastrarte (lectura anclada en tu mensaje) y aparece el botón ↓.
  const updateTurnSpacer = useCallback(() => {
    const container = messagesContainerRef.current
    const spacer = turnSpacerRef.current
    if (!container || !spacer) return
    if (!anchorActiveRef.current) {
      if (spacer.style.height && spacer.style.height !== '0px') spacer.style.height = '0px'
      return
    }
    const content = messagesContentRef.current
    const userNodes = content?.querySelectorAll<HTMLElement>('[data-msg-role="user"]')
    const lastUser = userNodes?.length ? userNodes[userNodes.length - 1] : null
    if (!lastUser) {
      spacer.style.height = '0px'
      return
    }
    // Altura del turno = del top del último mensaje del user al inicio del spacer.
    // offsetTop de ambos es relativo al contenedor scrolleable (offsetParent
    // posicionado), y el offsetTop del spacer no depende de su propia altura.
    const turnHeight = spacer.offsetTop - lastUser.offsetTop
    const target = Math.max(0, container.clientHeight - turnHeight - 24)
    spacer.style.height = `${target}px`
    // La respuesta LLENÓ la pantalla del turno → el spacer ya no hace falta. Desde
    // el 1 oct 2026 NO se pasa a modo seguimiento: la respuesta sigue creciendo
    // debajo del fold sin mover lo que lees (ver pinSettleUntilRef).
    if (target === 0 && anchorActiveRef.current) {
      anchorActiveRef.current = false
    }
    // El crecimiento del contenido NO dispara eventos de scroll: recalcular aquí
    // "sigo al fondo?" para que el botón ↓ aparezca cuando la respuesta rebasa
    // el viewport (misma fórmula que handleMessagesScroll).
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
    isAtBottomRef.current = atBottom
    setShowScrollBtn(!atBottom)
  }, [])

  // Auto-scroll only when user is at the bottom (smart scroll).
  // Instantáneo, NO smooth: los scrolls smooth se interrumpen en iOS cuando el
  // contenido crece a mitad de animación y dejaban isAtBottomRef en false a
  // medio camino (el scroll handler corre también en scrolls programáticos) —
  // esa race apagaba el auto-scroll para todo el resto del turno.
  useEffect(() => {
    // Streaming: la lectura se queda donde está (1 oct 2026) — no perseguimos el
    // fondo mientras la respuesta crece, estés o no hasta abajo.
    if (loading && Date.now() >= pinSettleUntilRef.current) return
    if (isAtBottomRef.current) {
      const el = messagesContainerRef.current
      if (el) {
        requestAnimationFrame(() => {
          // Re-verificar al EJECUTAR, no solo al agendar: el rAF del mount
          // (atBottom=true default) aterriza DESPUÉS del restore del caché y
          // pineaba el fondo pisando la posición restaurada.
          if (!isAtBottomRef.current || restoreScrollRef.current != null) return
          fijarScroll(el, el.scrollHeight)
        })
      } else {
        bottomRef.current?.scrollIntoView()
      }
    }
  }, [messages, loading])

  // Al abrir/cambiar de conversación, aparecer HASTA ABAJO (lo más reciente).
  // El pin real ocurre pre-paint en el useLayoutEffect de abajo, cuando los
  // mensajes YA están en el DOM (el rAF post-paint de antes corría ANTES de que
  // el fetch async terminara de renderizar → a veces no aterrizaba abajo).
  // EXCEPCIÓN: view restaurado del caché en memoria con scroll propio — ese
  // cambio de sesión NO debe forzar el fondo (pisaría la posición restaurada).
  useEffect(() => {
    // Restore de scroll PENDIENTE (aún no consumido por el layout effect): no
    // forzar fondo. Cubre el 2º pase de StrictMode, que corre con activeSession
    // todavía null (closure del mount) y se saltaba el guard por id.
    if (restoreScrollRef.current != null) return
    // Restore YA aplicado a esta sesión: tampoco forzar fondo.
    if (activeSession?.id && activeSession.id === restoredSessionIdRef.current) return
    // Ancla a mensaje (&msg=) pendiente o recién aplicada: este efecto es
    // PASIVO y corre DESPUÉS del layout effect que ancló — marcar atBottom aquí
    // pisaba el ancla (el siguiente ResizeObserver clavaba el fondo).
    if (scrollToMsgRef.current || anchorLockRef.current) return
    isAtBottomRef.current = true
    setShowScrollBtn(false)
  }, [activeSession?.id])

  // Pin/anclaje síncrono ANTES del paint del render que trae mensajes nuevos:
  //  - restoreScrollRef: view restaurado desde el caché en memoria → volver a
  //    la posición EXACTA donde estabas al salir de la pestaña.
  //  - pinToBottomRef: sesión recién cargada → aterrizar en el último mensaje
  //    sin flash del top (useLayoutEffect corre antes de que el browser pinte).
  //  - prependAnchorRef: historial viejo prepended → conservar la posición
  //    visual exacta (scrollTop compensado por el alto agregado arriba).
  useLayoutEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    // Sin mensajes renderizados no hay nada que anclar — y CONSUMIR los refs
    // aquí sería fatal: el doble-invoke de StrictMode (dev) re-corre este efecto
    // con el closure viejo (lista vacía) y se comía restoreScrollRef contra el
    // contenedor vacío (scrollTop clampeado a ~0) antes del commit real.
    if (messages.length === 0) return
    if (restoreScrollRef.current != null) {
      fijarScroll(el, restoreScrollRef.current)
      restoreScrollRef.current = null
      return
    }
    // Deep-link a mensaje (&msg=): anclar al INICIO de ese mensaje. Si aún no
    // está en el DOM (snapshot stale sin el mensaje nuevo), NO consumir el ref
    // — cae al pin normal y la página fresca re-intenta el anclaje.
    if (scrollToMsgRef.current) {
      const target = el.querySelector<HTMLElement>(`[data-msg-id="${scrollToMsgRef.current}"]`)
      if (target) {
        const msgId = scrollToMsgRef.current
        scrollToMsgRef.current = null
        pinToBottomRef.current = false
        fijarScroll(el, Math.max(0, target.offsetTop - 12))
        isAtBottomRef.current = false
        setShowScrollBtn(true)
        // Candado: mantener el ancla mientras el contenido async (markdown,
        // gráficas) empuja el layout. Un gesto real del usuario lo suelta.
        anchorLockRef.current = { id: msgId, until: Date.now() + 4000 }
        const releaseAnchor = () => {
          anchorLockRef.current = null
          el.removeEventListener('wheel', releaseAnchor)
          el.removeEventListener('touchstart', releaseAnchor)
        }
        el.addEventListener('wheel', releaseAnchor, { passive: true })
        el.addEventListener('touchstart', releaseAnchor, { passive: true })
        setHighlightMsgId(msgId)
        setTimeout(() => setHighlightMsgId((curr) => (curr === msgId ? null : curr)), 1800)
        return
      }
    }
    if (prependAnchorRef.current) {
      const { prevHeight, prevTop } = prependAnchorRef.current
      prependAnchorRef.current = null
      fijarScroll(el, prevTop + (el.scrollHeight - prevHeight))
      return
    }
    if (pinToBottomRef.current) {
      pinToBottomRef.current = false
      fijarScroll(el, el.scrollHeight)
      isAtBottomRef.current = true
      // Conversación recién abierta: si trae un turno vivo, dejar que el fondo se
      // asiente mientras el markdown monta; tu primer gesto suelta la ventana.
      pinSettleUntilRef.current = Date.now() + 1500
      const soltar = () => {
        pinSettleUntilRef.current = 0
        el.removeEventListener('wheel', soltar)
        el.removeEventListener('touchstart', soltar)
      }
      el.addEventListener('wheel', soltar, { passive: true })
      el.addEventListener('touchstart', soltar, { passive: true })
    }
  }, [messages])

  // Ancla del turno recién enviado (pre-paint): tu mensaje aterriza ARRIBA del
  // viewport con el spacer reservando la pantalla para la respuesta — el
  // comportamiento de Claude iOS/ChatGPT al enviar. El user bubble se renderiza
  // síncrono (texto plano, sin dynamic import), así que ya está en el DOM aquí.
  useLayoutEffect(() => {
    if (!anchorPendingRef.current) return
    const container = messagesContainerRef.current
    const content = messagesContentRef.current
    if (!container || !content) return
    const userNodes = content.querySelectorAll<HTMLElement>('[data-msg-role="user"]')
    const lastUser = userNodes.length ? userNodes[userNodes.length - 1] : null
    if (!lastUser) return
    anchorPendingRef.current = false
    anchorActiveRef.current = true
    pinSettleUntilRef.current = 0 // enviaste: tu mensaje manda, nada de asentar el fondo
    updateTurnSpacer()
    fijarScroll(container, Math.max(0, lastUser.offsetTop - 12))
    isAtBottomRef.current = true
    setShowScrollBtn(false)
  }, [messages, updateTurnSpacer])

  // Mantener el fondo pegado mientras el contenido CRECE después del primer
  // paint (MarkdownMessage monta async por dynamic import, imágenes cargan,
  // etc.) — solo cuando el user ya está abajo. Sin esto, el "último mensaje"
  // queda a media pantalla cuando el markdown termina de montar.
  useEffect(() => {
    const content = messagesContentRef.current
    const el = messagesContainerRef.current
    if (!content || !el) return
    const observer = new ResizeObserver(() => {
      // El spacer se recalcula en cada cambio de tamaño del contenido (la
      // respuesta creciendo lo consume 1:1 → scrollHeight estable).
      updateTurnSpacer()
      // Candado de ancla a mensaje (&msg= de un push): mientras el contenido
      // async crece, RE-anclar al inicio del target en vez de perseguir el fondo.
      if (anchorLockRef.current) {
        if (Date.now() < anchorLockRef.current.until) {
          const target = el.querySelector<HTMLElement>(`[data-msg-id="${anchorLockRef.current.id}"]`)
          if (target) {
            fijarScroll(el, Math.max(0, target.offsetTop - 12))
            isAtBottomRef.current = false
            return
          }
        }
        anchorLockRef.current = null
      }
      // Streaming: NO perseguir el fondo (1 oct 2026). El crecimiento no dispara
      // eventos de scroll, así que aquí se recalcula «¿sigo abajo?»: sin esto el
      // botón ↓ no aparecía y, al terminar el turno, el efecto de mensajes te
      // aventaba al fondo con un isAtBottom viejo.
      if (chatLoadingRef.current && Date.now() >= pinSettleUntilRef.current) {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        isAtBottomRef.current = atBottom
        setShowScrollBtn(!atBottom)
        return
      }
      if (isAtBottomRef.current) fijarScroll(el, el.scrollHeight)
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [activeSession?.id, loadingSession, messages.length > 0, updateTurnSpacer])

  // Track whether user is near the bottom — show/hide scroll button.
  // Cerca del top + hay historial → auto-cargar la página anterior.
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    // Candado de ancla activo: los scrolls de este handler son programáticos
    // (re-anclajes) — congelar el tracking de atBottom para que el contenido
    // corto/creciente no lo marque "al fondo" y dispare el chase-bottom.
    if (anchorLockRef.current && Date.now() < anchorLockRef.current.until) {
      lastScrollTopRef.current = el.scrollTop
      return
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    isAtBottomRef.current = atBottom
    // Copia viva para el snapshot de unmount (chat-view-cache): en el cleanup
    // de unmount React ya soltó los DOM refs — el contenedor es null ahí.
    lastScrollTopRef.current = el.scrollTop
    setShowScrollBtn(!atBottom)
    if (el.scrollTop < 300 && hasMoreRef.current && !loadingOlderRef.current) {
      loadOlderRef.current?.()
    }
  }, [])

  // Jump to bottom (used by button + after sending a message)
  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) {
      deslizarScroll(el, el.scrollHeight)
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    isAtBottomRef.current = true
    setShowScrollBtn(false)
  }, [])

  // When the container resizes (keyboard open/close), scroll to bottom if we were there.
  // This fixes the scroll-position drift that leaves messages cut off after keyboard dismiss.
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    // Teclado del iPhone (19 oct 2026, Daniel: el hilo quedó en blanco al escribir): tras un cambio grande de alto
    // (abrir/cerrar teclado) se revisa que algún mensaje se vea; si no, la misma cura del vigía del hilo, con reporte.
    let altoPrevio = el.clientHeight
    let revision: number | undefined
    const revisarTrasCambioDeAlto = () => {
      const contenido = messagesContentRef.current
      if (!contenido || el.clientHeight < 40) return
      const antes = medirHilo(el, contenido)
      if (!antes.vacio) return
      curarHilo(el, contenido)
      isAtBottomRef.current = true
      setShowScrollBtn(false)
      reportarHilo({ tipo: 'vacio', mensaje: 'hilo vacío a la vista tras cambiar de alto (teclado)', sesion: activeSessionRef.current?.id ?? null, detalle: antes.detalle })
    }
    const observer = new ResizeObserver(() => {
      // El viewport cambió (teclado abre/cierra): el spacer se redimensiona a la
      // nueva pantalla disponible antes de decidir el pin.
      updateTurnSpacer()
      const alto = el.clientHeight
      if (Math.abs(alto - altoPrevio) > 80) { window.clearTimeout(revision); revision = window.setTimeout(revisarTrasCambioDeAlto, 500) }
      altoPrevio = alto
      if (anchorLockRef.current && Date.now() < anchorLockRef.current.until) return
      if (isAtBottomRef.current) fijarScroll(el, el.scrollHeight)
    })
    observer.observe(el)
    return () => { observer.disconnect(); window.clearTimeout(revision) }
  }, [updateTurnSpacer])

  // Auto-resize textarea — done inline in handleInputChange (no useEffect needed)

  // ── Memoria de las conversaciones abiertas en esta instancia ────────────────
  //
  // Trabajar en paralelo (mandar en A, saltar a B mientras A responde, volver a A)
  // pagaba red en CADA salto: el caché en memoria guardaba una sola conversación y
  // solo se aplicaba al montar la página. Ahora se guarda el view al SALIR y se
  // restaura al ENTRAR, síncrono, sin red ni IndexedDB — la revalidación contra el
  // server sigue corriendo detrás, así que la verdad no se sacrifica, solo la espera.

  /** Congela el view de la conversación abierta para poder volver a ella gratis. */
  const snapshotView = useCallback(() => {
    const session = activeSessionRef.current
    if (!session) return
    const msgs = messagesRef.current
    if (msgs.length === 0) return
    saveChatView({
      session,
      // Sanitizar streams en vuelo: el detach marca streaming=false async y puede
      // correr DESPUÉS de esto — sin esto, el view restaurado mostraría un cursor ▍
      // fantasma pegado para siempre.
      messages: msgs.map((m) => (m.streaming ? { ...m, streaming: false, status: null } : m)),
      hasMore: hasMoreRef.current,
      oldestLoaded: oldestLoadedRef.current,
      scrollTop: !isAtBottomRef.current ? lastScrollTopRef.current : null,
      suggestions: suggestionsRef.current,
    })
  }, [])

  /** Pinta una conversación ya vista desde memoria. true = ya está en pantalla. */
  const paintFromMemory = useCallback((sessionId: string): boolean => {
    const memo = getChatView(sessionId)
    if (!memo) return false
    restoredSessionIdRef.current = memo.scrollTop != null ? sessionId : null
    setHasMore(memo.hasMore)
    oldestLoadedRef.current = memo.oldestLoaded
    restoreMessages(memo.messages, memo.suggestions)
    if (memo.scrollTop != null) {
      restoreScrollRef.current = memo.scrollTop
      isAtBottomRef.current = false
      setShowScrollBtn(true)
    } else {
      pinToBottomRef.current = true
      isAtBottomRef.current = true
    }
    return true
  }, [restoreMessages, setHasMore])

  /**
   * Cierra el lazo al volver a una conversación que estaba respondiendo.
   *
   * Al salir, el parcial se congela en memoria y el turno sigue vivo en el daemon.
   * Al volver hay dos finales posibles: el turno SIGUE vivo (el resume se
   * reengancha y no hay nada que hacer aquí), o TERMINÓ mientras estaba en otra
   * conversación. En ese segundo caso, la pantalla se quedaba con la respuesta a
   * medias para siempre —eso es lo que se siente como "se colgó la llamada"—
   * porque el parcial local es más nuevo que nada y nadie iba a reemplazarlo. La
   * respuesta completa sí existe: el server la persistió. Se va por ella.
   */
  const reconciliarParcial = useCallback(
    async (sessionId: string, seq: number) => {
      const ultimo = messagesRef.current[messagesRef.current.length - 1]
      const quedoParcial = ultimo?.role === 'assistant' && ultimo.id.startsWith('a-')
      if (!quedoParcial || chatLoadingRef.current) return
      try {
        const { messages: fresh, hasMore, error } = await history.loadMessages(sessionId, {
          limit: MESSAGES_PAGE_SIZE,
        })
        if (error || seq !== selectSeqRef.current || chatLoadingRef.current || !fresh.length) return
        loadMessages(fresh)
        setHasMore(hasMore)
        oldestLoadedRef.current = fresh[0]?.created_at ?? null
        cacheSnapshot('chat', `chat:messages:${sessionId}`, { messages: fresh, hasMore }).catch(() => {})
      } catch { /* sin red: el regreso al foreground reintenta */ }
    },
    [history, loadMessages, setHasMore],
  )

  const handleSelectSession = useCallback(
    async (session: ChatSession) => {
      // El view de la conversación que dejo se guarda ANTES de tocar nada, para
      // poder volver a ella sin recargarla.
      snapshotView()
      // If streaming in another session, detach it (let it continue in background)
      detachStream()
      // Candado de ancla de la sesión anterior: no debe sobrevivir al cambio.
      // (scrollToMsgRef NO se toca: el caller pudo setearlo justo antes.)
      anchorLockRef.current = null
      const seq = ++selectSeqRef.current
      setActiveSession(session)
      // Semáforo del sidebar: abrirla la marca como vista (→ gris). Fire and
      // forget — no bloquea la carga de mensajes. Abrirla de nuevo desde la lista anula un «Marcar como
      // no leído» hecho a mano sobre ella (menú «⋯», 1 oct).
      olvidarAMano(session.id)
      void history.markRead(session.id)
      // TEMPORAL: mantener el espacio de cuenta sincronizado con la conversación
      // abierta (robustez ante deep-link ?session= a un espacio distinto). Así el
      // store leído por useChat.sendMessage siempre == cuenta de esta conversación.
      if (!session.isSDKOnly || session.conTurnosArbrain) {
        useAccountStore.getState().setAccount(toChatAccount(session.account))
      }
      localStorage.setItem('mc_lastChatSessionId', session.id)
      // sessionStorage = memoria de NAVEGACIÓN (sobrevive cambios de tab dentro
      // de la app, muere al cerrarla): el cold open sigue aterrizando en
      // conversación nueva (decisión 2 jul), pero tab-switch regresa aquí.
      try { sessionStorage.setItem('mc_activeChatSessionId', session.id) } catch { /* storage lleno/privado */ }
      anchorActiveRef.current = false
      anchorPendingRef.current = false
      setHasMore(false)
      oldestLoadedRef.current = null

      // 0) Si ya la abrí en esta instancia, se pinta SÍNCRONO desde memoria: cero
      //    red, cero IndexedDB, con su estado rico (toolCalls/thinking/usage) y el
      //    scroll donde lo dejé. Es el caso del trabajo en paralelo.
      let painted = paintFromMemory(session.id)

      // 1) Si no estaba en memoria, pintar desde el snapshot local en disco: el
      //    chat entra al toque con la última página conocida, sin skeleton.
      if (!painted) {
        try {
          const cached = await getCachedSnapshot<{ messages: PersistedMessage[]; hasMore: boolean }>(
            `chat:messages:${session.id}`,
          )
          if (seq === selectSeqRef.current && cached?.messages?.length) {
            loadMessages(cached.messages)
            setHasMore(cached.hasMore)
            oldestLoadedRef.current = cached.messages[0]?.created_at ?? null
            pinToBottomRef.current = true
            painted = true
          }
        } catch { /* sin snapshot — flujo normal */ }
      }
      if (seq !== selectSeqRef.current) return
      if (!painted) setLoadingSession(true)

      // 2) Revalidar contra el server: solo la ÚLTIMA página (no todo el historial)
      try {
        const { messages: fresh, hasMore, error: errorCarga } = await history.loadMessages(session.id, {
          limit: MESSAGES_PAGE_SIZE,
        })
        if (seq !== selectSeqRef.current) return
        // No se pudo leer (base, daemon o red caídos): lo pintado se queda, la caché no se pisa y se dice la causa.
        // 12 oct 2026: con PostgREST muerto, las conversaciones se veían vacías y se invitaba a borrarlas.
        if (errorCarga) {
          showChatError(`No pude cargar esta conversación ahora: ${errorCarga}. ${painted ? 'Lo que ves es lo último guardado en este dispositivo; ' : ''}vuelve a abrirla en un momento.`)
          return
        }
        // Turno a medio responder que restauré desde memoria (volví a una
        // conversación que sigue trabajando): su parcial NO existe todavía en el
        // server, así que pisar con la página de BD lo borraría de pantalla y
        // parecería que la respuesta se perdió. El resume de abajo lo reconstruye
        // completo; hasta entonces, se respeta lo que ya está en pantalla.
        const ultimo = messagesRef.current[messagesRef.current.length - 1]
        const hayParcialVivo =
          ultimo?.role === 'assistant' && ultimo.id.startsWith('a-') && !!ultimo.content.trim()
        // Si el user ya está enviando un mensaje en esta sesión, no pisar el
        // estado en vuelo con la página del server (llega por realtime igual).
        if (!chatLoadingRef.current && !hayParcialVivo) {
          loadMessages(fresh)
          setHasMore(hasMore)
          oldestLoadedRef.current = fresh[0]?.created_at ?? null
          // Solo re-pinear si el user sigue abajo — si ya scrolleó hacia arriba
          // mientras revalidábamos, no lo arrancamos de donde está leyendo.
          pinToBottomRef.current = isAtBottomRef.current
        }
        // Sesión SDK que llegó VACÍA = casi seguro el daemon no respondió (el
        // proxy devuelve [] en el catch). Antes moría en silencio y el chat se
        // quedaba en el estado vacío sin explicación — avisar al user.
        if (session.isSDKOnly && fresh.length === 0 && !painted) {
          showChatError('No pude cargar esta conversación — el daemon no respondió. Reintenta en un momento.')
        }
        // Sesión MC VACÍA (0 filas y sin más páginas) = sesión fantasma: el turno
        // que la creó nunca se completó (incidente 17-18 jul: daemon caído 38h).
        // Antes abría en silencio el estado "Hola Daniel" y parecía que la
        // conversación "no cargaba". Gate de 15 min: una sesión recién creada con
        // su primer turno EN VUELO también tiene 0 filas y no es fantasma.
        if (!session.isSDKOnly && fresh.length === 0 && !hasMore && !painted
          && Date.now() - new Date(session.created_at).getTime() > 15 * 60_000) {
          showChatError('Esta conversación está vacía: su primer turno nunca llegó a completarse (probablemente el daemon estaba caído al enviarlo). Puedes borrarla desde el menú ⋯ del sidebar.')
        }
        cacheSnapshot('chat', `chat:messages:${session.id}`, { messages: fresh, hasMore }).catch(() => {})
      } finally {
        if (seq === selectSeqRef.current) setLoadingSession(false)
      }

      // Resume: si esta sesión tiene un turno EN VUELO en el daemon (la elegiste
      // mientras Levy respondía), reengánchate al vivo. Si NO hay turno vivo pero
      // quedó un parcial en pantalla, es que terminó sin mí: ir por la versión
      // completa en vez de dejar la respuesta a medias.
      if (seq === selectSeqRef.current) {
        void resumeStream(session.id, session.account ?? 'default').then((enganchado) => {
          if (!enganchado) void reconciliarParcial(session.id, seq)
        })
      }
    },
    [history, loadMessages, detachStream, setHasMore, resumeStream, showChatError, snapshotView, paintFromMemory, reconciliarParcial],
  )

  // Abrir una sesión conociendo SOLO su id (deep-link de un push / cold open):
  // el UUID ya viene en la URL — esperar la lista de sesiones para "resolverlo"
  // era una cadena serial de 2 round-trips (lista de 30 sesiones → recién
  // entonces mensajes), y para sesiones SDK directamente NO abría nada (la
  // lista MC llega primero sin ellas y el efecto marcaba hasAutoLoaded).
  //  · SDK ("sdk:..."): sesión mínima → handleSelectSession carga del daemon.
  //  · MC: snapshot IndexedDB al instante + endpoint combinado (sesión +
  //    mensajes en UN round-trip, posiblemente ya prefetcheado por el SW).
  const openSessionById = useCallback(
    async (targetId: string) => {
      if (targetId.startsWith('sdk:')) {
        // Una solo-SDK que Arbrain conduce ya viene en la lista con su título y su cuenta (1 oct 2026).
        const conocida = history.sessions.find((s) => s.id === targetId)
          ?? useRecientesStore.getState().traidas.find((s) => s.id === targetId)
        if (conocida?.conTurnosArbrain) { void handleSelectSession(conocida); return }
        const nowIso = new Date().toISOString()
        void handleSelectSession({
          id: targetId,
          title: 'Conversación',
          is_favorite: false,
          profile_id: null,
          created_at: nowIso,
          updated_at: nowIso,
          sdkSessionId: targetId.slice(4),
          account,
          isSDKOnly: true,
        })
        return
      }

      snapshotView() // la conversación que dejo queda en memoria para volver gratis
      detachStream()
      anchorLockRef.current = null
      const seq = ++selectSeqRef.current
      anchorActiveRef.current = false
      anchorPendingRef.current = false
      setHasMore(false)
      oldestLoadedRef.current = null
      localStorage.setItem('mc_lastChatSessionId', targetId)
      try { sessionStorage.setItem('mc_activeChatSessionId', targetId) } catch { /* storage lleno/privado */ }

      // Sesión provisional (título desde el snapshot local de la lista si
      // existe) para que la UI no se quede en "conversación nueva" mientras
      // llega la red — el objeto real del server la reemplaza abajo.
      const nowIso = new Date().toISOString()
      let provisional: ChatSession = {
        id: targetId, title: '…', is_favorite: false, profile_id: null,
        created_at: nowIso, updated_at: nowIso,
      }
      try {
        const cachedList = await getCachedSnapshot<ChatSession[]>(
          account === 'default' ? 'chat:sessions' : `chat:sessions:${account}`,
        )
        const hit = cachedList?.find((s) => s.id === targetId)
        if (hit) provisional = hit
      } catch { /* sin snapshot de lista */ }
      if (seq !== selectSeqRef.current) return
      setActiveSession(provisional)

      // 0) Ya abierta en esta instancia → pintado síncrono desde memoria.
      let painted = paintFromMemory(targetId)

      // 1) Pintar AL INSTANTE desde el snapshot local de mensajes (si existe)
      if (!painted) {
        try {
          const cached = await getCachedSnapshot<{ messages: PersistedMessage[]; hasMore: boolean }>(
            `chat:messages:${targetId}`,
          )
          if (seq === selectSeqRef.current && cached?.messages?.length) {
            loadMessages(cached.messages)
            setHasMore(cached.hasMore)
            oldestLoadedRef.current = cached.messages[0]?.created_at ?? null
            pinToBottomRef.current = true
            painted = true
          }
        } catch { /* sin snapshot — flujo normal */ }
      }
      if (seq !== selectSeqRef.current) return
      if (!painted) setLoadingSession(true)

      // 2) UN round-trip: sesión + última página juntas (el SW pudo dejarla ya
      //    en el device al recibir el push — ver sw.js).
      try {
        const combo = await history.fetchSessionWithMessages(targetId, { limit: MESSAGES_PAGE_SIZE })
        if (seq !== selectSeqRef.current) return
        if (!combo) {
          if (!painted) showChatError('No pude cargar esa conversación. Reintenta en un momento.')
          return
        }
        setActiveSession(combo.session)
        // Mantener el espacio de cuenta sincronizado con la conversación abierta
        useAccountStore.getState().setAccount(toChatAccount(combo.session.account))
        // Mismo respeto al parcial en vuelo restaurado desde memoria que en
        // handleSelectSession: la BD todavía no lo tiene, pisarlo lo borraría.
        const ultimo = messagesRef.current[messagesRef.current.length - 1]
        const hayParcialVivo =
          ultimo?.role === 'assistant' && ultimo.id.startsWith('a-') && !!ultimo.content.trim()
        if (!chatLoadingRef.current && !hayParcialVivo) {
          loadMessages(combo.messages)
          setHasMore(combo.hasMore)
          oldestLoadedRef.current = combo.messages[0]?.created_at ?? null
          pinToBottomRef.current = isAtBottomRef.current
        }
        // Mismo aviso de sesión fantasma que handleSelectSession (deep-link path).
        if (combo.messages.length === 0 && !combo.hasMore && !painted
          && Date.now() - new Date(combo.session.created_at).getTime() > 15 * 60_000) {
          showChatError('Esta conversación está vacía: su primer turno nunca llegó a completarse (probablemente el daemon estaba caído al enviarlo). Puedes borrarla desde el menú ⋯ del sidebar.')
        }
        cacheSnapshot('chat', `chat:messages:${targetId}`, { messages: combo.messages, hasMore: combo.hasMore }).catch(() => {})
      } finally {
        if (seq === selectSeqRef.current) setLoadingSession(false)
      }

      if (seq === selectSeqRef.current) {
        void resumeStream(targetId, activeSessionRef.current?.account ?? 'default').then((enganchado) => {
          if (!enganchado) void reconciliarParcial(targetId, seq)
        })
      }
    },
    [account, history, loadMessages, detachStream, setHasMore, resumeStream, handleSelectSession, showChatError, snapshotView, paintFromMemory, reconciliarParcial],
  )

  // Hidratar la sesión provisional cuando la lista real llega (título/flags):
  // openSessionById pudo abrir con un placeholder antes de que existiera la lista.
  useEffect(() => {
    const current = activeSessionRef.current
    if (!current || (current.title !== '…' && current.title !== 'Conversación')) return
    const real = history.sessions.find((s) => s.id === current.id)
    if (real && real.title !== current.title) setActiveSession(real)
  }, [history.sessions])

  // Una conversación creada aquí deja de estar «por crear» cuando la nube ya la tiene. Antes conservaba la marca
  // mientras siguiera abierta y cada mensaje salía por la ruta del borrador, que suelta la pantalla al instante:
  // un segundo Enter abría un turno paralelo (DeepSeek, 2 oct 2026: mensaje duplicado y «Preparando respuesta»).
  useEffect(() => {
    const current = activeSessionRef.current
    if (!current?.pendingCreation) return
    const real = history.sessions.find((s) => s.id === current.id && !s.pendingCreation)
    if (!real) return
    const confirmada = { ...current, ...real, pendingCreation: false }
    activeSessionRef.current = confirmada
    setActiveSession(confirmada)
  }, [history.sessions])

  // Paginación hacia atrás: baja la página anterior y PREPENDEA conservando la
  // posición visual (anchor pre-paint arriba). Disparada por botón o al acercarse
  // al top del scroll.
  const loadOlderMessages = useCallback(async () => {
    const session = activeSession
    if (!session || session.isSDKOnly) return
    if (loadingOlderRef.current || !hasMoreRef.current || !oldestLoadedRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    const seq = selectSeqRef.current
    try {
      const { messages: older, hasMore, error } = await history.loadMessages(session.id, {
        limit: MESSAGES_PAGE_SIZE,
        before: oldestLoadedRef.current,
      })
      // Si el user cambió de sesión mientras bajaba la página, descartar. Con falla, «hay más» se conserva.
      if (seq !== selectSeqRef.current || error) return
      if (older.length > 0) {
        oldestLoadedRef.current = older[0]?.created_at ?? oldestLoadedRef.current
        const el = messagesContainerRef.current
        if (el) prependAnchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop }
        prependMessages(older)
      }
      setHasMore(hasMore)
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [activeSession, history, prependMessages, setHasMore])

  // Ref estable para que el scroll handler (deps []) pueda dispararla
  const loadOlderRef = useRef(loadOlderMessages)
  useEffect(() => { loadOlderRef.current = loadOlderMessages }, [loadOlderMessages])

  // ── Recuperación al volver a la app (teléfono bloqueado / app en background) ──
  // Cuando el cliente se desconecta a mitad de un turno, ClaudeClaw termina en
  // background y guarda via /api/chat/complete. Pero Supabase Realtime NO reenvía
  // eventos perdidos mientras el websocket estuvo muerto: si el INSERT ocurrió con
  // el teléfono bloqueado, ese mensaje jamás llega al canal. Patrón estándar de
  // apps de chat (Claude iOS / ChatGPT): reconciliar contra el server en cada
  // regreso al foreground. La push sigue siendo el aviso; esto es la red de pesca.
  // También se reusa como revalidación en background tras restaurar el view
  // desde el caché en memoria (navegación entre tabs).
  const lastForegroundSyncRef = useRef(0)
  const refreshActiveSession = useCallback(async () => {
    const session = activeSessionRef.current
    if (!session) return
    if (chatLoadingRef.current) return // stream vivo en ESTE cliente: no pisar el turno en vuelo
    const now = Date.now()
    if (now - lastForegroundSyncRef.current < 1500) return // visibility+focus+pageshow disparan juntos
    lastForegroundSyncRef.current = now

    // Resume PRIMERO: si el daemon tiene un turno EN VUELO para esta sesión
    // (reabriste la app a mitad del streaming), reengánchate al vivo y sigue
    // justo donde va — sin recargar la BD. Si no hay turno vivo, cae a la
    // reconciliación normal. Aplica también a sesiones SDK-only.
    try {
      const attached = await resumeStream(session.id, session.account ?? 'default')
      if (attached) return
    } catch { /* sin turno vivo — reconciliar abajo */ }

    // Reconciliación contra BD: solo sesiones Supabase (las SDK-only viven en el
    // transcript del daemon; su verdad se recarga al seleccionarlas).
    if (session.isSDKOnly) return
    if (chatLoadingRef.current) return // el resume pudo enganchar un turno vivo
    try {
      const { messages: fresh, hasMore, error } = await history.loadMessages(session.id, { limit: MESSAGES_PAGE_SIZE })
      // El mundo pudo cambiar durante el fetch: sesión distinta o envío en curso
      if (activeSessionRef.current?.id !== session.id || chatLoadingRef.current) return
      if (error || fresh.length === 0) return
      // Turno detacheado a medio stream (cambiaste de tab mientras Levy respondía):
      // el parcial local aún no existe en el server — reemplazar lo borraría de
      // pantalla. Merge aditivo; el resultado final llega por realtime/refetch.
      const lastLocal = messagesRef.current[messagesRef.current.length - 1]
      const hasDetachedPartial =
        lastLocal?.role === 'assistant' && lastLocal.id.startsWith('a-') && !!lastLocal.content.trim()
      if (isAtBottomRef.current && !hasDetachedPartial) {
        // En el fondo (caso normal al volver): estado 100% fiel al server —
        // incluye el turno que se completó mientras estabas fuera.
        loadMessages(fresh)
        setHasMore(hasMore)
        oldestLoadedRef.current = fresh[0]?.created_at ?? null
        pinToBottomRef.current = true
        cacheSnapshot('chat', `chat:messages:${session.id}`, { messages: fresh, hasMore }).catch(() => {})
      } else {
        // Leyendo historial arriba (o hay parcial local): merge aditivo sin mover el scroll
        for (const m of fresh) {
          appendMessage({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at),
            audioUrl: m.audio_url ?? undefined,
            imageUrl: m.image_url ?? undefined,
            metadata: m.metadata ?? undefined,
          })
        }
      }
    } catch { /* red aún dormida al despertar — el próximo trigger reintenta */ }
  }, [history, loadMessages, appendMessage, setHasMore, resumeStream])

  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState === 'hidden') return
      refreshActiveSession()
    }
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('focus', onForeground)
    window.addEventListener('pageshow', onForeground) // bfcache restore (iOS PWA)
    window.addEventListener('online', onForeground)
    return () => {
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('focus', onForeground)
      window.removeEventListener('pageshow', onForeground)
      window.removeEventListener('online', onForeground)
    }
  }, [refreshActiveSession])

  // ── Chat vivo (3 oct 2026): turnos que nacen sin que Daniel escriba ──
  // Un aviso de subagente, un Bash en segundo plano que termina o un despertador abren un turno en el
  // journal sin que este cliente lo haya pedido. Con la conversación abierta y en reposo se consulta
  // /api/chat/active cada 1.2 s (una consulta indexada por dueño); si aparece un turno en curso de ESTA
  // conversación, se engancha al vivo con el mismo pipeline del reenganche. Así se pinta en < 3 s.
  useEffect(() => {
    let vivo = true
    let ocupado = false
    let revisadoEn = 0
    const revisar = async () => {
      const session = activeSessionRef.current
      // Oculta no consulta; sin foco, cada ~5 s (shared/lib/reposo): sigue llegando, sin una consulta por segundo.
      // Teléfono (11 oct 2026, datos móviles): cada 3 s en vez de 1.2 s. Un turno que nace solo se pinta igual en
      // segundos y son ~60 % menos consultas. Escritorio y laptop siguen a 1.2 s.
      if (!vivo || ocupado || !session || chatLoadingRef.current || !tocaLeerAhora(esTelefonoAhora() ? 3_000 : 1_200, revisadoEn)) return
      ocupado = true
      revisadoEn = Date.now()
      try {
        const res = await fetch('/api/chat/active', { cache: 'no-store' })
        const json = res.ok ? await res.json() as { available?: boolean; turns?: Array<{ conversationId?: string; account?: string; status?: string }> } : null
        const turno = json?.available ? json.turns?.find(t => t.conversationId === session.id) : undefined
        if (!vivo || !turno || chatLoadingRef.current || activeSessionRef.current?.id !== session.id) return
        await resumeStream(session.id, turno.account ?? session.account ?? 'default')
      } catch { /* sin red: el siguiente pulso reintenta */ }
      finally { ocupado = false }
    }
    const iv = setInterval(() => { void revisar() }, 1_200)
    return () => { vivo = false; clearInterval(iv) }
  }, [resumeStream])

  // Snapshot del view al DESMONTAR (navegar a otra pestaña): el caché en
  // memoria conserva lo ya abierto — mensajes deserializados, paginación y
  // scroll exacto — para que volver a /chat sea percepción de latencia CERO.
  // (snapshotView usa lastScrollTopRef y no el DOM ref justamente para esto: en
  // el cleanup del unmount el contenedor ya es null.)
  useEffect(() => {
    return () => { snapshotView() }
  }, [snapshotView])

  // Default al abrir (decisión de Daniel, fase 2): conversación NUEVA — el chat
  // aterriza vacío, listo para escribir, sin bajar historial (cero red = cold
  // open aún más rápido). Dos EXCEPCIONES, en orden de prioridad:
  //   1. Deep-link ?session= (push/cron): esa sesión específica se abre.
  //   2. Navegación interna (tab-switch): cada cambio de ruta desmonta la página
  //      completa (no hay keep-alive), así que la sesión activa vive en
  //      sessionStorage — sobrevive moverse entre tabs, muere al cerrar la app.
  //      El cold open sigue aterrizando en conversación nueva.
  // We DON'T strip the query param — it's harmless (refresh just reopens the same
  // session) and manually editing window.history can confuse Next.js App Router on iOS PWA.
  useEffect(() => {
    if (hasAutoLoaded.current) return

    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('session')
    let fromNav: string | null = null
    try { fromNav = sessionStorage.getItem('mc_activeChatSessionId') } catch { /* modo privado */ }
    // 6 oct 2026 (Daniel: «asegúrate que me abra en el último chat donde me quedé»): en frío ya no se aterriza en una
    // conversación nueva, se vuelve a la última que tuvo abierta (localStorage). Si ya no existe, el camino de abajo
    // cae a conversación nueva como antes.
    let fromLast: string | null = null
    try { fromLast = localStorage.getItem('mc_lastChatSessionId') } catch { /* modo privado */ }
    // 10 oct 2026 (Daniel, en el teléfono: «al abrir, lo primero es el chat: una conversación nueva lista para escribir»):
    // en el teléfono la apertura en frío nace en una conversación nueva; la anterior queda en el historial. El escritorio
    // sigue volviendo a la última. Un deep link (?session=) manda siempre.
    if (chatArrancaNuevo()) { fromNav = null; fromLast = null }
    const targetId = fromUrl ?? fromNav ?? fromLast

    if (!targetId) {
      // Sin deep-link ni sesión en curso: quedarse en conversación nueva. No
      // esperar a que carguen las sesiones — no las necesitamos para arrancar.
      hasAutoLoaded.current = true
      return
    }

    // &msg= del push: anclar al INICIO de ese mensaje al terminar de cargar.
    // Con ancla de mensaje se salta el restore en memoria (su scroll guardado
    // pisaría el anclaje) y se abre fresco por el fast path.
    const msgAnchor = fromUrl ? params.get('msg') : null
    if (msgAnchor) scrollToMsgRef.current = msgAnchor

    // Camino INSTANTÁNEO: si el view de esa sesión sigue en el caché en memoria
    // (navegación entre tabs), se restaura síncrono en este mismo render — cero
    // red, cero IndexedDB, cero espera de la lista de sesiones. Mensajes con su
    // estado rico (toolCalls/thinking/usage) y scroll exacto donde estabas.
    const cached = msgAnchor ? null : getChatView(targetId)
    if (cached) {
      hasAutoLoaded.current = true
      restoredSessionIdRef.current = cached.scrollTop != null ? cached.session.id : null
      activeSessionRef.current = cached.session
      setActiveSession(cached.session)
      // TEMPORAL: sincronizar el espacio de cuenta con la conversación restaurada.
      if (!cached.session.isSDKOnly) {
        useAccountStore.getState().setAccount(toChatAccount(cached.session.account))
      }
      setHasMore(cached.hasMore)
      oldestLoadedRef.current = cached.oldestLoaded
      restoreMessages(cached.messages, cached.suggestions)
      if (cached.scrollTop != null) {
        restoreScrollRef.current = cached.scrollTop
        isAtBottomRef.current = false
        setShowScrollBtn(true)
      } else {
        pinToBottomRef.current = true
        isAtBottomRef.current = true
      }
      // Revalidar contra el server SIN bloquear el paint (mismo camino que el
      // regreso al foreground — trae lo que haya llegado mientras no estabas).
      setTimeout(() => { void refreshActiveSession() }, 0)
      return
    }

    // FAST PATH: el id ya viene en la URL/sessionStorage — abrir DIRECTO sin
    // esperar la lista de sesiones. Antes esto era una cadena serial (bajar 30
    // sesiones solo para resolver un UUID conocido) y las sesiones SDK ni
    // siquiera abrían: la lista MC llegaba primero SIN ellas, el efecto marcaba
    // hasAutoLoaded y el deep-link moría en una conversación nueva vacía.
    hasAutoLoaded.current = true
    void openSessionById(targetId)
  }, [openSessionById, restoreMessages, refreshActiveSession, setHasMore])

  const modeloPendienteRef = useRef<string | null>(null)
  const recordarUsoRef = useRef<(cuenta: string) => void>(() => {})
  const handleNewChat = useCallback(async (opts?: { conservarCuenta?: boolean }) => {
    // La conversación que dejo se guarda: abrir una nueva no debe costarme volver
    // a la anterior (antes esto vaciaba el caché entero).
    snapshotView()
    // Configuración → Modelo (2 oct 2026): la conversación nueva nace en el motor elegido. Sin
    // preferencia («Como está») no se toca el espacio activo. Cambiar de pestaña conserva su cuenta.
    // 3 oct 2026: nace con el ÚLTIMO modelo que Daniel usó; uno deshabilitado jamás (cae al primer encendido).
    if (opts?.conservarCuenta !== true) {
      const inicio = inicioDeChatNuevo(useCatalogoModelos.getState().catalogo, usePreferenciaMotor.getState().preferencia)
      if (inicio.cuenta && inicio.cuenta !== useAccountStore.getState().account) {
        if (inicio.cayo && inicio.modelo && esEspacioClaude(inicio.cuenta)) modeloPendienteRef.current = inicio.modelo
        setAccount(toChatAccount(inicio.cuenta))
      }
    }
    // If streaming, detach it (let it continue in background)
    detachStream()
    setActiveSession(null)
    clearMessages()
    try { sessionStorage.removeItem('mc_activeChatSessionId') } catch { /* ignore */ }
    scrollToMsgRef.current = null
    anchorLockRef.current = null
    anchorActiveRef.current = false
    anchorPendingRef.current = false
    // Foco directo al composer — listo para escribir (paridad Claude/ChatGPT)
    requestAnimationFrame(() => textareaRef.current?.focus())
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'newchat' }),
      })
    } catch { /* ignore */ }
  }, [clearMessages, detachStream, setAccount])

  // TEMPORAL (2026-07-08): cambiar de espacio de cuenta (Tú ↔ bro-claude). No se
  // puede cruzar el resume del SDK entre cuentas (transcripts viven por config
  // dir), así que al cambiar arrancamos limpio; el sidebar recarga con las
  // conversaciones del nuevo espacio (useChatHistory reacciona a `account`).
  // La pestaña Crons es solo una vista distinta del sidebar: no toca la cuenta
  // ni resetea la conversación abierta.
  const handleTabChange = useCallback((next: ChatTab) => {
    if (next === 'crons') {
      setShowCronsTab(true)
      return
    }
    setShowCronsTab(false)
    if (next === account) return
    setAccount(next)
    handleNewChat({ conservarCuenta: true })
  }, [account, setAccount, handleNewChat])

  // Cada imagen se LEE a memoria y se reduce (lado mayor 4096 px, formato eficiente) antes de tocar el borrador:
  // un File de captura o de portapapeles puede dejar de existir en disco y entonces ni se ve, ni se guarda, ni se sube.
  // Va al borrador de la conversación donde se pegó, aunque cambies de conversación mientras se prepara.
  const attachImages = useCallback((files: File[]) => {
    if (files.length === 0) return
    const key = composerKeyRef.current, scope = draftScope.current
    preparandoRef.current += files.length; setPreparingImages(n => n + files.length)
    const trabajo = preparacionRef.current.then(async () => {
      for (const file of files) {
        try {
          const esDoc = esDocumentoAceptado(file)
          if (!esDoc && !esArchivoDeImagen(file)) throw new ErrorImagen('formato', `«${file.name || 'archivo'}» no es un formato que pueda adjuntar: imágenes (PNG, JPG, WebP, GIF, HEIC) o documentos (PDF, Word, Excel, PowerPoint, CSV, texto).`)
          const borrador = composerDrafts.entry(key, EMPTY_CHAT_DRAFT).value, actuales = borrador.imageFiles.length + borrador.imagenesSubidas.length
          if (actuales >= MAX_IMAGES) throw new ErrorImagen('demasiado-grande', `Máximo ${MAX_IMAGES} archivos por mensaje; quita alguno para adjuntar «${file.name || 'otro'}».`)
          const lista = esDoc ? await prepararDocumento(file) : await prepararImagen(file, esTelefonoAhora() ? PERFIL_DATOS_MOVILES : PERFIL_NORMAL)
          composerDrafts.update(key, EMPTY_CHAT_DRAFT, cur => cur.imageFiles.length + cur.imagenesSubidas.length >= MAX_IMAGES ? cur : { ...cur, imageFiles: [...cur.imageFiles, lista] })
          if (draftScope.current === scope) textareaRef.current?.focus()
        } catch (e) {
          if (draftScope.current === scope) showChatError(e instanceof ErrorImagen ? e.message : `No pude preparar «${file.name || 'la imagen'}»: ${e instanceof Error ? e.message : 'error desconocido'}. Vuelve a adjuntarla.`, 12000)
        } finally { preparandoRef.current = Math.max(0, preparandoRef.current - 1); setPreparingImages(n => Math.max(0, n - 1)) }
      }
    })
    preparacionRef.current = trabajo
  }, [showChatError])

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Copy FileList to array BEFORE resetting value — iOS Safari clears the
    // live FileList reference when e.target.value is reset
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    attachImages(files)
  }, [attachImages])

  // Paste images from clipboard (Cmd+V / Ctrl+V / mobile paste)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = clipboardImages(e.clipboardData)
    const docs = Array.from(e.clipboardData.files ?? []).filter(esDocumentoAceptado)
    if(images.length || docs.length) { e.preventDefault(); attachImages([...images, ...docs]); return }
    const content = e.clipboardData.getData('text/plain')
    const path = localImagePath(content)
    if(path) {
      e.preventDefault()
      const scope = draftScope.current
      void readPastedImage(path).then(file=>{if(draftScope.current===scope)attachImages([file])}).catch(error=>{if(draftScope.current===scope)showChatError(String(error?.message??error))})
      return
    }
    if (!isLongText(content)) return
    e.preventDefault()
    const next = [...textFiles, pastedTextFile(content, textFiles)]
    const error = textAttachmentError(next)
    if (error) { showChatError(error); return }
    setTextFiles(next)
    // Pasting replaces a selection, while unrelated instructions stay in the composer.
    const el = e.currentTarget
    setInput(el.value.slice(0, el.selectionStart) + el.value.slice(el.selectionEnd))
    requestAnimationFrame(autoResizeTextarea)
  }, [attachImages, textFiles, autoResizeTextarea])

  const removePendingImage = useCallback((index: number) => {
    setImageFiles(prev=>prev.filter((_,i)=>i!==index))
  }, [])

  const clearAllPendingImages = useCallback(() => {
    setImageFiles([])
  }, [])

  // Editing keeps the original history available; native execution forks first.
  const handleSubmitEdit = async (rawText: string) => {
    const finalText = rawText.trim()
    const editId = editingMsgId
    const session = activeSession
    if (!editId || !finalText || !session || session.isSDKOnly) { handleCancelEdit(); return }

    const editIdx = messages.findIndex((m) => m.id === editId)
    if (editIdx === -1) { handleCancelEdit(); return }

    const originalText = messages[editIdx].content
    if (!originalText.trim()) { handleCancelEdit(); return }
    // Ocurrencia desde el final: cuántos mensajes de user NO-cron con ESTE MISMO
    // texto hay desde el editado (inclusive) al final. Desempata duplicados en el
    // daemon (que localiza el mensaje por contenido en el transcript del SDK).
    const editOccurrenceFromEnd = messages
      .slice(editIdx)
      .filter((m) => m.role === 'user'
        && (m.metadata as { source?: string } | undefined)?.source !== 'cron'
        && m.content === originalText)
      .length

    setEditingMsgId(null)
    setInput(''); setTextFiles([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.overflowY = ''   // vuelve al hidden del CSS
    }

    isAtBottomRef.current = true
    setShowScrollBtn(false)
    anchorPendingRef.current = true
    const effort = inferEffort(decodeTextAttachments(finalText).text)
    sendMessage(finalText, {
      chatSessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      editOriginalText: originalText,
      editTurnId: messages[editIdx].metadata?.turnId,
      editOccurrenceFromEnd,
      ...(effort && { effort }),
      account: session.account ?? account,
    })
  }

  // Fotos cuentan como contenido: con algo en la caja el botón ENVÍA, nunca detiene.
  const hayParaEnviar = input.trim().length > 0 || textFiles.length > 0 || pendingImages.length > 0 || imagenesSubidas.length > 0
  const boton = botonDelComposer({ trabajando: loading, hayContenido: hayParaEnviar })
  const marcarEnvio = () => {
    ultimoEnvioRef.current = Date.now(); setDetenerListo(false)
    window.setTimeout(() => setDetenerListo(true), GRACIA_DETENER_MS)
  }
  marcarEnvioRef.current = marcarEnvio
  /** Regresa a la caja un borrador que no pudo salir, sin pisar lo que se escribió después. */
  const devolverBorrador = (key: string, draft: typeof EMPTY_CHAT_DRAFT) => composerDrafts.update(key, EMPTY_CHAT_DRAFT, cur => {
    const vacio = !cur.input.trim() && !cur.textFiles.length && !cur.imageFiles.length && !cur.imagenesSubidas.length
    if (vacio) return draft
    return { ...cur, input: [draft.input, cur.input].filter(t => t.trim()).join('\n\n'), textFiles: [...draft.textFiles, ...cur.textFiles], imageFiles: [...draft.imageFiles, ...cur.imageFiles].slice(0, MAX_IMAGES), imagenesSubidas: [...draft.imagenesSubidas, ...cur.imagenesSubidas] }
  })
  const subirImagenes = async (files: File[]) => {
    const urls: string[] = []; const fallos: FalloSubida[] = []
    setUploadingImage(true)
    try {
      for (const file of files) {
        // Un reintento automático para lo que es del camino (red, servidor reiniciando, cuerpo cortado).
        const r = await subirImagen(file)
        if (r.ok) urls.push(r.url)
        else { fallos.push(r.fallo); console.warn('[chat/upload] falló', { nombre: file.name, bytes: file.size, tipo: file.type, estado: r.fallo.estado, codigo: r.fallo.codigo, intentos: r.intentos }) }
      }
    } finally {
      setUploadingImage(false)
    }
    return { urls, fallos }
  }
  const handleSend = async (text?: string, opts?: { desdeCola?: boolean; imagenes?: string[]; context?: string }) => {
    const desdeCola = !!opts?.desdeCola
    if (!desdeCola && !composerDraft.ready) return
    // Imágenes que aún se leen/reducen: el envío espera a que entren al borrador (nunca sale sin ellas).
    if (!desdeCola && preparandoRef.current > 0) await preparacionRef.current
    // El borrador VIVO, no el del render: un segundo Enter o un doble clic antes de
    // repintar ya ve la caja vacía y no manda el mismo mensaje otra vez.
    const outgoingKey = composerKey, outgoingScope = draftScope.current
    const outgoingDraft = text === undefined ? composerDrafts.entry(outgoingKey, EMPTY_CHAT_DRAFT).value : null
    const msg = text ?? encodeTextAttachments(outgoingDraft!.input, outgoingDraft!.textFiles)
    const fotos = outgoingDraft?.imageFiles ?? []
    // Adjuntos ya subidos que volvieron de la fila para editarse: van primero, en su orden.
    const subidas = outgoingDraft?.imagenesSubidas ?? []
    const editando = !!outgoingDraft?.editingMsgId
    const trabajando = loading || ocupado() || enviandoRef.current
    // El mismo texto de un turno que sigue sin resolverse no abre otro: duplicaría el trabajo (2 oct 2026).
    if (!desdeCola && !editando && fotos.length === 0 && subidas.length === 0 && repiteTurnoEnCurso(messages, msg)) {
      showChatError('Ese mismo mensaje ya va en camino y Levy lo está trabajando. Su respuesta aparece aquí al terminar.', 8000)
      return
    }
    const destino = destinoDelEnvio({
      trabajando, desdeCola, editando,
      hayContenido: !!msg.trim() || fotos.length > 0 || subidas.length > 0 || !!opts?.imagenes?.length,
      filaEsperando: !desdeCola && cola.esperando(),
    })
    if (destino === 'nada') {
      if (editando && trabajando) showChatError('Para editar un mensaje anterior espera a que Levy termine; lo que escribas nuevo sí entra a la fila.')
      return
    }
    const vaciarCaja = () => {
      if (!outgoingDraft) return
      composerDrafts.clearIfUnchanged(outgoingKey, EMPTY_CHAT_DRAFT, outgoingDraft)
      setPaletteQuery(null); setPaletteSelectedIndex(0)
      if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.overflowY = '' }
    }
    // Las fotos se suben ANTES de decidir el envío, con la caja ya vacía: se ve
    // enviado al instante y un segundo toque no puede repetirlo.
    let imageUrls: string[] = [...(opts?.imagenes ?? []), ...subidas]
    if (fotos.length > 0) {
      vaciarCaja(); marcarEnvio()
      enviandoRef.current = true
      let subida
      try { subida = await subirImagenes(fotos) } finally { enviandoRef.current = false }
      if (subida.fallos.length > 0) {
        devolverBorrador(outgoingKey, outgoingDraft!)
        showChatError(mensajeFallosSubida(subida.fallos, fotos.length, subida.urls.length), 20000)
        return // Nunca se manda un set incompleto.
      }
      imageUrls = [...imageUrls, ...subida.urls]
      if (draftScope.current !== outgoingScope) { devolverBorrador(outgoingKey, outgoingDraft!); return } // Se queda en su conversación.
    }
    // Con Levy trabajando, o con la fila esperando su salida, todo entra a la fila
    // (en orden). Nunca interrumpe: detener es solo el botón con la caja vacía.
    // Se reevalúa aquí: durante la subida pudo arrancar un turno (la fila, otra pestaña).
    if (destino === 'fila' || (!desdeCola && !editando && (loading || ocupado()))) {
      // Enter con Levy trabajando = el mensaje entra al turno EN CURSO (7 oct 2026, como Claude Code). La fila
      // del dispositivo queda para lo que no aplica: sin red, Codex, fotos, comandos o una fila que ya espera.
      if (puedeInyectar({ enLinea: isOnline(), motorCodex: !turnoInyectable(), conAdjuntos: imageUrls.length > 0, esComando: msg.trim().startsWith('/'),
        editando, turnoVivo: loading && !despachando, conversacion: activeSession?.id }) && !cola.esperando()) {
        vaciarCaja(); marcarEnvio()
        if (await inyectar(msg)) return
        // No entró (el turno terminó en ese instante, sin red, rechazo): a la fila, como antes. No se pierde.
      }
      cola.encolar(msg, imageUrls)
      vaciarCaja(); marcarEnvio()
      // Fila esperando y Levy libre: sale ya, con lo nuevo al final.
      if (!(loading || ocupado())) soltarFilaRef.current()
      return
    }
    // Modo edición: rebobina la conversación a este mensaje y reenvía (fork del
    // contexto SDK). La fila nunca entra por aquí.
    if (editando && !desdeCola) {
      await handleSubmitEdit(msg)
      return
    }
    // /clear is handled locally — no need to round-trip to agent
    if (msg.trim() === '/clear') {
      handleNewChat()
      setInput('')
      setPaletteQuery(null)
      setPaletteSelectedIndex(0)
      return
    }
    // /model without args opens the picker
    if (msg.trim() === '/model') {
      setShowModelPicker(true)
      setInput('')
      setPaletteQuery(null)
      setPaletteSelectedIndex(0)
      return
    }
    // /effort without args opens the slider
    if (msg.trim() === '/effort') {
      setShowEffortSlider(true)
      setInput('')
      setPaletteQuery(null)
      setPaletteSelectedIndex(0)
      return
    }
    isAtBottomRef.current = true
    setShowScrollBtn(false)
    anchorPendingRef.current = true

    const imageUrl = imageUrls.length > 0 ? imageUrls.join('\n') : undefined
    const adjuntos = separarAdjuntos(imageUrl)
    const defaultMsg = mensajePorDefecto(adjuntos.imagenes.length, adjuntos.documentos.length)
    const finalMsg = msg.trim() || defaultMsg

    // Reset del composer ANTES de cualquier await — el tap debe sentirse
    // instantáneo: input limpio + burbuja pintada en el mismo tick (React
    // batchea estos sets con el paint de sendMessage). La fila sale sin tocar
    // lo que estés escribiendo en el composer.
    if (!desdeCola) {
      vaciarCaja(); marcarEnvio()
      setShowModelPicker(false)
      setShowEffortSlider(false)
    }

    // La sesión debe existir antes del FETCH (ClaudeClaw mapea SDK session →
    // chat session; sin id caería a la sesión global 'mc-web' y mezclaría
    // contexto), pero NO antes del PAINT: se crea en background y sendMessage
    // la resuelve justo antes de disparar el stream. Antes este await bloqueaba
    // la UI ~200-500ms sin feedback (la latencia que se sentía al enviar).
    const sessionPromise = activeSession?.id
      ? undefined
      : history.createSession(textMessageTitle(finalMsg))
          .then((newSession) => {
            // Ref PRIMERO: el onSave del stream en vuelo lee el ref al terminar —
            // sin esto crearía una sesión duplicada (ver comentario de activeSessionRef).
            activeSessionRef.current = newSession
            setActiveSession(newSession)
            localStorage.setItem('mc_lastChatSessionId', newSession.id)
            try { sessionStorage.setItem('mc_activeChatSessionId', newSession.id) } catch { /* ignore */ }
            return newSession
          })
          .catch((err) => {
            console.error('[ChatPanel] Failed to pre-create session:', err)
            return null
          })

    const effort = inferEffort(decodeTextAttachments(finalMsg).text)
    sendMessage(finalMsg, {
      imageUrl,
      chatSessionId: activeSession?.id,
      createConversation: activeSession?.pendingCreation,
      ...(sessionPromise && { sessionPromise }),
      sdkSessionId: activeSession?.sdkSessionId,
      ...(effort && { effort }),
      // TEMPORAL: la cuenta de la conversación abierta (o del espacio activo si es
      // nueva). El store se mantiene sincronizado con la conversación abierta.
      account: activeSession?.account ?? account,
      // Enfoque del agente activo de Live (Levy/Trinity/Sensei): contexto por turno, mismo cerebro.
      ...(opts?.context && { context: opts.context }),
    })
    recordarUsoRef.current(activeSession?.account ?? account)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteQuery !== null) {
      const filtered = comandosFiltrados
      if (e.key === 'Escape') {
        setPaletteQuery(null)
        setPaletteSelectedIndex(0)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPaletteSelectedIndex((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPaletteSelectedIndex((i) => Math.min(filtered.length - 1, i + 1))
        return
      }
      // Tab (o Enter) selecciona el comando resaltado — paridad con editores/CLIs.
      // Shift+Tab retrocede en la lista.
      if (e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          setPaletteSelectedIndex((i) => Math.max(0, i - 1))
        } else {
          const cmd = filtered[paletteSelectedIndex] ?? filtered[0]
          if (cmd) handleCommandSelect(cmd.name)
        }
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const cmd = filtered[paletteSelectedIndex] ?? filtered[0]
        if (cmd) {
          e.preventDefault()
          handleCommandSelect(cmd.name)
          return
        }
        // Sin coincidencias: «/lo-que-sea» se envía tal cual como prompt al SDK.
        setPaletteQuery(null)
        setPaletteSelectedIndex(0)
      }
    }
    // ↑ con el composer vacío regresa el último mensaje de la fila para editarlo.
    if (e.key === 'ArrowUp' && !input && cola.items.length > 0) {
      e.preventDefault()
      editarDeFila()
      return
    }
    const isMobile = window.innerWidth < 768
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = useCallback((val: string) => {
    setInput(val)
    // Auto-resize inline — avoids useEffect extra render cycle + double-paint
    const el = textareaRef.current
    if (el) {
      autoResizeTextarea()
      // Keep ghost overlay aligned with the textarea's internal scroll so the
      // caret line stays visible once the cap kicks in.
      if (overlayRef.current) overlayRef.current.scrollTop = el.scrollTop
    }
    // Palette updates are non-critical UI — defer to avoid blocking input responsiveness
    startTransition(() => {
      // «/» abre la paleta con cualquier nombre sin espacios; «@» (agentes) solo si es el primer carácter.
      // Un segundo «/» o «@» (rutas, correos) la cierra.
      const match = val.match(/^([/@])([^\s/@]*)$/)
      if (match) {
        setPaletteQuery(match[0])
        setPaletteSelectedIndex(0)
      } else {
        setPaletteQuery(null)
        setPaletteSelectedIndex(0)
      }
    })
  }, [autoResizeTextarea])

  const handleCommandSelect = (cmdName: string) => {
    if (cmdName === '/model') {
      setShowModelPicker(true)
      setPaletteQuery(null)
      setPaletteSelectedIndex(0)
      setInput('')
      return
    }
    if (cmdName === '/effort') {
      setShowEffortSlider(true)
      setPaletteQuery(null)
      setPaletteSelectedIndex(0)
      setInput('')
      return
    }
    setPaletteQuery(null)
    setPaletteSelectedIndex(0)
    const cmd = catalogoComandos.find((c) => c.name === cmdName)
    if (cmd && pideArgumentos(cmd)) {
      // Pide argumentos (skills, /goal, /loop, agentes...): se rellena el composer y Daniel termina la frase.
      const relleno = textoRelleno(cmd)
      handleInputChange(relleno)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(relleno.length, relleno.length)
      })
      return
    }
    // Sin argumentos: se envía de inmediato.
    setInput('')
    handleSend(cmdName)
  }

  // Overrides POR CONVERSACIÓN: un pick de modelo/esfuerzo hecho en un chat
  // NUEVO debe aterrizar en la conversación que está por nacer — sin sesión, el
  // daemon lo guardaría en el espacio global 'mc-web' y el primer mensaje real
  // (que sí crea sesión) no lo heredaría. Mismo patrón de pre-creación en
  // background que handleSend/handleVoiceNote.
  const ensureCommandSession = (title: string) =>
    activeSessionRef.current?.id  // ref, no state: en combos secuenciales el state aún es stale
      ? undefined
      : history.createSession(title)
          .then((newSession) => {
            activeSessionRef.current = newSession
            setActiveSession(newSession)
            localStorage.setItem('mc_lastChatSessionId', newSession.id)
            try { sessionStorage.setItem('mc_activeChatSessionId', newSession.id) } catch { /* ignore */ }
            return newSession
          })
          .catch((err) => {
            console.error('[ChatPanel] Failed to pre-create session:', err)
            return null
          })

  // Contexto de ESTA conversación: el último turno terminado que lo trae (cambia con la conversación y
  // al terminar cada turno). Sin dato del motor, el indicador no aparece.
  const contextoConversacion = useMemo(() => contextoDeConversacion(messages), [messages])

  const handleEffortStopSelect = async (stop: EffortStop) => {
    if (stop === currentEffort) { setShowEffortSlider(false); return }
    // Conversación ya creada: directo al daemon (2 oct 2026). Por el stream, un turno en curso descartaba
    // el cambio en silencio y el dial volvía atrás. Si falla, lanza y el dial sigue abierto con el error.
    const created = activeSessionRef.current
    if (created?.id && !created.pendingCreation) {
      await changeEffort(stop === 'ultracode-on' ? { ultracode: true } : stop === 'ultracode-off' ? { ultracode: false } : { effort: stop }, created.id)
      setShowEffortSlider(false)
      return
    }
    setShowEffortSlider(false)
    anchorPendingRef.current = true
    const command = stop === 'ultracode-off' ? '/ultracode off' : stop === 'ultracode-on' ? '/ultracode on' : `/effort ${stop}`
    const sessionPromise = ensureCommandSession(command)
    await sendMessage(command, { chatSessionId: activeSessionRef.current?.id,
      createConversation: activeSessionRef.current?.pendingCreation, ...(sessionPromise && { sessionPromise }) })
  }

  const enviarModelo = (modelValue: string) => {
    // Cambio mid-conversación (como Claude iOS): el daemon aplica el modelo al
    // próximo mensaje del mismo hilo — sin confirm() nativo.
    anchorPendingRef.current = true
    const sessionPromise = ensureCommandSession(`/model ${modelValue}`)
    sendMessage(`/model ${modelValue}`, { chatSessionId: activeSessionRef.current?.id,
      createConversation: activeSessionRef.current?.pendingCreation, ...(sessionPromise && { sessionPromise }) })
  }

  // Selector único (2 oct 2026): Claude cambia de modelo dentro de la conversación; un modelo de otro motor abre
  // una conversación nueva en su espacio (la fila del selector lo anuncia). El modelo de Claude elegido desde otro
  // motor se aplica cuando la conversación nueva ya está en el espacio de Claude (efecto de abajo).
  const handleModelSelect = (m: ModeloCatalogo) => {
    setShowModelPicker(false)
    if (cabeEnConversacion(m, account)) {
      if (m.via === 'suscripcion' && m.modelo && !esModeloActual(m, account, currentModel)) enviarModelo(m.modelo)
      return
    }
    modeloPendienteRef.current = m.via === 'suscripcion' ? m.modelo : null
    setAccount(toChatAccount(m.cuenta))
    void handleNewChat({ conservarCuenta: true })
  }
  useEffect(() => {
    const pendiente = modeloPendienteRef.current
    if (!pendiente || !esEspacioClaude(account)) return
    modeloPendienteRef.current = null
    enviarModelo(pendiente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  const handleVoiceNote = useCallback((transcription: string, audioUrl: string) => {
    // Si al terminar de dictar Levy ya trabaja (salió la fila, otra pestaña), la nota
    // entra a la fila como texto: sendMessage la descartaría en silencio.
    if (ocupado() || enviandoRef.current || cola.esperando()) {
      const nota = `[Nota de voz]: ${transcription}`
      // Igual que el texto: con un turno de Claude vivo, la nota entra a ese turno; si no aplica, a la fila.
      if (!enviandoRef.current && !cola.esperando() && turnoInyectable() && isOnline()) {
        marcarEnvioRef.current()
        void inyectar(nota).then(entro => { if (!entro) { cola.encolar(nota); if (!ocupado()) soltarFilaRef.current() } })
        return
      }
      cola.encolar(nota); marcarEnvioRef.current(); if (!ocupado()) soltarFilaRef.current(); return }
    isAtBottomRef.current = true
    setShowScrollBtn(false)
    anchorPendingRef.current = true
    // Mismo patrón que handleSend: sin sesión activa, crearla en background —
    // antes una nota de voz en conversación nueva caía a la sesión global 'mc-web'.
    const sessionPromise = activeSession?.id
      ? undefined
      : history.createSession(transcription.slice(0, 80) || 'Nota de voz')
          .then((newSession) => {
            activeSessionRef.current = newSession
            setActiveSession(newSession)
            localStorage.setItem('mc_lastChatSessionId', newSession.id)
            try { sessionStorage.setItem('mc_activeChatSessionId', newSession.id) } catch { /* ignore */ }
            return newSession
          })
          .catch((err) => {
            console.error('[ChatPanel] Failed to pre-create session (voice):', err)
            return null
          })
    sendMessage(`[Nota de voz]: ${transcription}`, {
      audioUrl,
      chatSessionId: activeSession?.id,
      createConversation: activeSession?.pendingCreation,
      ...(sessionPromise && { sessionPromise }),
      account: activeSession?.account ?? account,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendMessage, activeSession?.id, inyectar, turnoInyectable])
  // Edición cliente (21 oct 2026): el dictado solo transcribe (no sube audio); sin texto no se manda nada.
  const llaveVoz = useLlaveVoz(EDICION_CLIENTE)
  const notaVozCliente = useCallback((texto: string, audioUrl: string) => { if (texto.trim()) handleVoiceNote(texto, audioUrl) }, [handleVoiceNote])
  const irAjustesVoz = useCallback(() => {
    try { sessionStorage.setItem(MARCA_DESDE_MIC, '1') } catch { /* sin storage */ }
    useAjustes.getState().abrir('voz')
  }, [])

  // ESC behavior:
  //   - Durante streaming NO hace nada (1 oct 2026): detener es solo el botón, con la caja vacía.
  //   - Doble ESC sin streaming (<400ms entre presses): rewind del ultimo turn completado
  //     (borra user msg + assistant msg del state local y de Supabase, restaura texto al input)
  //
  // Implementacion: handleRewindRef (siempre actualizado) evita re-mount del listener en cada
  // setMessages durante SSE — sin esto, `messages` en deps montaria/desmontaria el handler 60+/seg.
  const lastEscPressRef = useRef<number>(0)
  const ESC_DOUBLE_TAP_MS = 400

  const handleRewindRef = useRef<() => void>(() => {})
  handleRewindRef.current = useCallback(async () => {
    if (loading) return
    if (!activeSession) return
    if (activeSession.isSDKOnly) return  // SDK-only sessions son read-only desde MC
    if (messages.length < 2) return

    const lastMsg = messages[messages.length - 1]
    const prevMsg = messages[messages.length - 2]

    // Solo rewindear turnos completos: assistant terminado (no streaming, no error) seguido de user
    if (lastMsg.role !== 'assistant' || lastMsg.streaming || lastMsg.error) return
    if (prevMsg.role !== 'user') return
    // Cron messages no son turnos del user — no aplica rewind
    if ((prevMsg.metadata as { source?: string } | undefined)?.source === 'cron') return

    const userText = prevMsg.content

    // Optimistic UI: remover ambos del state, restaurar input (usa el mismo callback que rollback)
    removeMessages([prevMsg.id, lastMsg.id])
    onRestoreInputCb(userText)

    // DELETE en Supabase (best-effort, NO revertir state si falla — UX del teclado debe ser instant)
    // Edición cliente: sin base en el navegador; el turno se borra por su ruta (misma regla: best-effort).
    if (EDICION_CLIENTE) {
      const turnId = (lastMsg.metadata as { turnId?: string } | undefined)?.turnId ?? (prevMsg.metadata as { turnId?: string } | undefined)?.turnId
      if (turnId) void fetch(`/api/chat/sessions/${encodeURIComponent(activeSession.id)}/messages?turnId=${encodeURIComponent(turnId)}`, { method: 'DELETE' }).catch(() => {})
      return
    }
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .in('id', [prevMsg.id, lastMsg.id])
      if (error) console.error('[ChatPanel] handleRewindLastTurn delete error:', error)
    } catch (err) {
      console.error('[ChatPanel] handleRewindLastTurn exception:', err)
    }
  }, [loading, activeSession, messages, removeMessages, onRestoreInputCb])

  // Track palette open state via ref para evitar re-mount del listener cuando paletteQuery cambia
  // (cada keystroke en el palette muta state). El listener no necesita re-registrarse para leer el ref.
  const paletteOpenRef = useRef(false)
  useEffect(() => { paletteOpenRef.current = paletteQuery !== null }, [paletteQuery])
  // Ref para leer el estado de edición dentro del handler global sin re-montarlo.
  const editingMsgIdRef = useRef<string | null>(null)
  useEffect(() => { editingMsgIdRef.current = editingMsgId }, [editingMsgId])

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return

      // Si el palette de slash commands esta abierto, su propio handleKeyDown se encarga de cerrarlo.
      // No queremos que el global handler marque timestamp ni haga rewind — falsos positivos garantizados.
      if (paletteOpenRef.current) return

      if (loading) {
        // Esc ya NO detiene a Levy (bug 1 oct 09:32): un Esc para cerrar otra cosa
        // interrumpía el turno y devolvía el texto a la caja; el reenvío lo duplicaba.
        // Detener es solo el botón, con la caja vacía.
        lastEscPressRef.current = 0  // reset, no encadenar con doble-ESC fantasma
        return
      }

      // Editando un mensaje (sin streaming): Esc cancela la edición, NO rebobina.
      if (editingMsgIdRef.current) {
        e.preventDefault()
        lastEscPressRef.current = 0
        handleCancelEdit()
        return
      }

      // Sin streaming: detectar doble-tap para rewind del ultimo turn
      const now = Date.now()
      const elapsed = now - lastEscPressRef.current
      if (elapsed < ESC_DOUBLE_TAP_MS) {
        e.preventDefault()
        lastEscPressRef.current = 0
        handleRewindRef.current?.()
      } else {
        // Primer ESC: marcar timestamp, esperar segundo
        lastEscPressRef.current = now
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loading, stopStreaming, handleCancelEdit])  // sin handleRewindRef ni paletteQuery en deps (ref pattern)

  // La preferencia de modelo de las conversaciones nuevas (Configuración → Modelo) se lee una vez.
  useEffect(() => { void usePreferenciaMotor.getState().cargar(); void useCatalogoModelos.getState().cargar() }, [])

  // 3 oct 2026: al abrir sin conversación, el espacio guardado en este equipo (localStorage) no manda: manda el
  // último modelo usado (servidor, igual en todos los dispositivos) y, si está apagado, el primero encendido.
  const catalogoModelos = useCatalogoModelos((s) => s.catalogo)
  const preferenciaUso = usePreferenciaMotor((s) => s.preferencia)
  const estadoPreferencia = usePreferenciaMotor((s) => s.estado)
  const inicioAplicado = useRef(false)
  useEffect(() => {
    if (inicioAplicado.current || !catalogoModelos || estadoPreferencia === 'cargando') return
    if (activeSession || messages.length > 0) { inicioAplicado.current = true; return }
    inicioAplicado.current = true
    const inicio = inicioDeChatNuevo(catalogoModelos, preferenciaUso)
    if (inicio.cuenta && inicio.cuenta !== account) {
      setAccount(toChatAccount(inicio.cuenta))
    } else if (!inicio.cuenta && !espacioVigente(catalogoModelos, account)) setAccount('default')
  }, [catalogoModelos, preferenciaUso, estadoPreferencia, activeSession, messages.length, account, setAccount])

  // Último uso: cada mensaje enviado recuerda motor, modelo y esfuerzo en el servidor (mismo almacén que
  // Configuración → Modelo), para que el chat nuevo en cualquier dispositivo nazca igual.
  const ultimoUsoGuardado = useRef('')

  const recordarUso = useCallback((cuenta: string) => {
    const claude = esEspacioClaude(cuenta)
    const uso = { motor: cuenta, modelo: claude ? (currentModel ?? null) : null, esfuerzo: currentEffort ?? null }
    const clave = JSON.stringify(uso)
    if (clave === ultimoUsoGuardado.current) return
    ultimoUsoGuardado.current = clave
    const guardar = usePreferenciaMotor.getState().guardar
    void guardar(uso).catch(() => guardar({ motor: cuenta, modelo: null, esfuerzo: null }).catch(() => { ultimoUsoGuardado.current = '' }))
  }, [currentModel, currentEffort])
  recordarUsoRef.current = recordarUso

  // Listen for new-chat event from mobile Header
  useEffect(() => {
    const handler = () => handleNewChat()
    window.addEventListener('openclaw:new-chat', handler)
    return () => window.removeEventListener('openclaw:new-chat', handler)
  }, [handleNewChat])

  // Header móvil: tap en "Levy / <modelo>" → abre el selector de modelos
  useEffect(() => {
    const handler = () => setShowModelPicker(true)
    window.addEventListener('openclaw:open-model-picker', handler)
    return () => window.removeEventListener('openclaw:open-model-picker', handler)
  }, [])

  // Listen for service worker messages — when user taps a push notification while
  // the app is already open on /chat, client.navigate() to the same route doesn't
  // remount the page, so the SW posts an explicit "open-chat-session" message.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; sessionId?: string; messageId?: string } | null
      if (data?.type !== 'open-chat-session' || !data.sessionId) return
      // &msg= del push: anclar al inicio de ese mensaje al cargar la sesión
      if (data.messageId) scrollToMsgRef.current = data.messageId
      const target = history.sessions.find((s) => s.id === data.sessionId)
      if (target) void handleSelectSession(target)
      // La sesión puede no estar en la lista todavía (SDK llega en un 2º fetch,
      // o la lista está a medio cargar) — abrir directo por id, no morir en silencio.
      else void openSessionById(data.sessionId)
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [history.sessions, handleSelectSession, openSessionById])

  // «Recientes» de la barra lateral (1 oct): publica la lista que ya cargó este panel
  // y abre la que Daniel elige ahí (mismo camino que el toque de un push).
  useEffect(() => {
    // Crons = transcripts del daemon, no conversaciones de Arbrain: no se publican (1 oct).
    if (showCronsTab) return
    useRecientesStore.getState().publicar(recientes(sesionesDeLista), activeSession?.id ?? null)
  }, [sesionesDeLista, activeSession?.id, showCronsTab])
  // Semáforo (1 oct): la conversación a la vista no puede quedarse «sin ver» (morada).
  // handleSelectSession ya la marca al abrirla desde la lista, pero NO los otros caminos de apertura
  // (enlace de un push, restaurar la pestaña) ni un turno que termina con ella abierta (otro
  // dispositivo, reenganche tras recargar). Una sola marca por (conversación, último mensaje).
  const vistaMarcadaRef = useRef('')
  useEffect(() => {
    const id = activeSession?.id
    if (!id || activeSession?.isSDKOnly || activeSession?.pendingCreation) return
    const marcar = () => {
      if (document.visibilityState !== 'visible') return
      const fila = history.sessions.find((s) => s.id === id)
      if (!fila || !hayNoVisto(fila)) return
      // «Marcar como no leído» sobre la conversación abierta (menú «⋯»): vale para ese último mensaje.
      if (fueAMano(id, fila.last_message_at)) return
      const clave = `${id}:${fila.last_message_at}`
      if (vistaMarcadaRef.current === clave) return
      vistaMarcadaRef.current = clave
      void history.markRead(id)
    }
    marcar()
    document.addEventListener('visibilitychange', marcar)
    return () => document.removeEventListener('visibilitychange', marcar)
  }, [history.sessions, history.markRead, activeSession?.id, activeSession?.isSDKOnly, activeSession?.pendingCreation])
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (!id || id === activeSessionRef.current?.id) return
      const target = history.sessions.find((s) => s.id === id)
      if (target) void handleSelectSession(target)
      else void openSessionById(id)
    }
    window.addEventListener('openclaw:open-session', handler)
    return () => window.removeEventListener('openclaw:open-session', handler)
  }, [history.sessions, handleSelectSession, openSessionById])
  // Fijada/desfijada desde «Recientes» (1 oct): el PATCH ya se hizo allá; aquí solo se recarga la lista
  // del panel «Ver todas» para que la fijada suba sin esperar otro refresco.
  useEffect(() => {
    const handler = () => { void history.loadSessions({ silent: true }) }
    window.addEventListener('openclaw:session-pinned', handler)
    return () => window.removeEventListener('openclaw:session-pinned', handler)
  }, [history.loadSessions])

  // Menú «⋯» (1 oct): si la conversación abierta se elimina o se archiva (desde «Recientes» o «Ver todas»),
  // el panel no puede seguir mostrándola ni escribiéndole: se suelta y queda lista una conversación nueva.
  // No pasa por handleNewChat: ese guarda la vista de la que deja, y la quitada no debe quedar en el caché.
  useEffect(() => {
    const handler = (e: Event) => {
      const c = (e as CustomEvent<CambioSesion>).detail
      if (!c || c.tipo !== 'quitada' || c.id !== activeSessionRef.current?.id) return
      detachStream()
      dropChatView(c.id)
      setActiveSession(null)
      clearMessages()
      scrollToMsgRef.current = null
      try { sessionStorage.removeItem('mc_activeChatSessionId') } catch { /* ignore */ }
      try { if (localStorage.getItem('mc_lastChatSessionId') === c.id) localStorage.removeItem('mc_lastChatSessionId') } catch { /* ignore */ }
    }
    window.addEventListener(EVENTO_CAMBIO_SESION, handler)
    return () => window.removeEventListener(EVENTO_CAMBIO_SESION, handler)
  }, [detachStream, clearMessages])

  // Realtime subscription: listen for new chat_messages on the active session
  useEffect(() => {
    if (!activeSession?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`chat_messages:${activeSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${activeSession.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            role: 'user' | 'assistant'
            content: string
            created_at: string
            audio_url?: string | null
            image_url?: string | null
            metadata?: { source?: string; jobId?: string; jobLabel?: string } | null
          }
          console.log('[realtime] Message received from Supabase:', {
            role: row.role,
            hasContent: !!row.content,
            contentPreview: row.content?.substring(0, 30),
            hasAudio: !!row.audio_url,
            hasImage: !!row.image_url,
            imageUrlPreview: row.image_url?.substring(0, 50),
          })
          appendMessage({
            id: row.id,
            role: row.role,
            content: row.content,
            timestamp: new Date(row.created_at),
            audioUrl: row.audio_url ?? undefined,
            imageUrl: row.image_url ?? undefined,
            metadata: row.metadata ?? undefined,
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeSession?.id, appendMessage])


  // Retry estable para burbujas de error: handleSend se re-crea cada render,
  // pero messagesList solo recomputa con [messages] — el ref evita closures stale.
  const handleSendRef = useRef<(text?: string, opts?: { desdeCola?: boolean; imagenes?: string[]; context?: string }) => void>(() => {})
  handleSendRef.current = handleSend

  // La meta (`/goal`) de la conversación (27 oct 2026, Goal UX). El hilo dice qué meta hay (turnos con `meta` y comandos
  // `/goal`); el daemon dice si Daniel la pausó. Claude: pausar/reanudar van directo al daemon (frenan aun con el turno
  // vivo) y quitar además manda `/goal clear` al CLI por la fila. Codex: sus comandos nativos de siempre.
  const metaClaude = !account || account === 'default' || account === 'bro'
  const sesionMeta = activeSession && !activeSession.pendingCreation ? activeSession.id : null
  const [metaServidor, setMetaServidor] = useState<{ sesion: string; estado: EstadoMeta; condicion?: string } | null>(null)
  const [metaAccionando, setMetaAccionando] = useState(false)
  const turnoEnCursoMeta = loading || despachando
  useEffect(() => {
    if (!sesionMeta || !metaClaude || turnoEnCursoMeta) return
    let vivo = true
    fetch(`/api/chat/meta?${new URLSearchParams({ session: sesionMeta, account: account ?? 'default' })}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { meta?: { estado?: EstadoMeta; condicion?: string } | null } | null) => {
        if (!vivo) return
        setMetaServidor(d?.meta?.estado === 'pausada' ? { sesion: sesionMeta, estado: 'pausada', condicion: d.meta.condicion } : null)
      }).catch(() => {})
    return () => { vivo = false }
  }, [sesionMeta, metaClaude, account, turnoEnCursoMeta, messages.length])
  const metaDelHilo = useMemo(() => metaVigente(messages, metaServidor?.sesion === sesionMeta ? metaServidor : null), [messages, metaServidor, sesionMeta])
  const accionMeta = async (accion: 'pausar' | 'reanudar' | 'quitar') => {
    if (!sesionMeta) return
    if (!metaClaude) { handleSendRef.current(accion === 'pausar' ? '/goal pause' : accion === 'reanudar' ? '/goal resume' : '/goal clear'); return }
    setMetaAccionando(true)
    try {
      const r = await fetch('/api/chat/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sesionMeta, account: account ?? 'default', accion }) })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'No se pudo cambiar la meta.')
      if (accion === 'quitar') {
        setMetaServidor({ sesion: sesionMeta, estado: 'quitada' })
        // El CLI es el dueño de la meta: `/goal clear` la borra de verdad. Con Levy trabajando entra a la fila y sale al terminar.
        handleSendRef.current('/goal clear')
      } else setMetaServidor(accion === 'pausar' ? { sesion: sesionMeta, estado: 'pausada' } : null)
    } catch (e) { showChatError(e instanceof Error ? e.message : 'No se pudo cambiar la meta.') }
    finally { setMetaAccionando(false) }
  }

  // La fila sale sola cuando el turno termina EN ESTA conversación. No sale si tú
  // detuviste a Levy (queda en pausa, a la vista) ni si el turno falló. Cambiar
  // de conversación libera el stream pero no es «terminar»: tampoco dispara.
  // Un borrador que sale por la cola (conversación recién creada) también es turno en curso aunque `loading` ya se soltó.
  const turnoEnCurso = loading || despachando
  const prevCargaRef = useRef(turnoEnCurso), prevSesionRef = useRef(activeSession?.id)
  // Solo se toma la fila cuando el envío es posible: si el chat volvió a ocuparse o el
  // borrador aún no carga, handleSend saldría sin enviar y la fila ya estaría vacía.
  const puedeEnviarRef = useRef(false)
  puedeEnviarRef.current = !turnoEnCurso && composerDraft.ready
  const soltarFila = useCallback((intentos = 0) => {
    if (!puedeEnviarRef.current) { if (intentos < 20) window.setTimeout(() => soltarFila(intentos + 1), 250); return }
    const fila = cola.tomarTodo(); if (fila) handleSendRef.current?.(fila.texto, { desdeCola: true, imagenes: fila.imagenes })
  }, [cola])
  soltarFilaRef.current = () => soltarFila()
  useEffect(() => {
    const antes = prevCargaRef.current, sesionAntes = prevSesionRef.current
    prevCargaRef.current = turnoEnCurso; prevSesionRef.current = activeSession?.id
    if (turnoEnCurso) { if (!antes) detencionManualRef.current = false; return }
    if (!antes || sesionAntes !== activeSession?.id) return
    if (!cola.hay()) { enviarYaRef.current = false; return }
    const ultimo = messages[messages.length - 1]
    if (!enviarYaRef.current && (detencionManualRef.current || ultimo?.error || cola.estaPausada())) { cola.pausar(); return }
    const ahora = enviarYaRef.current
    enviarYaRef.current = false
    // Tras «Enviar ya» el servidor confirma la detención antes de recibir la fila
    // (si llega antes, su propia fila por conversación la ordena igual).
    const t = window.setTimeout(() => soltarFila(), ahora ? 900 : 250)
    return () => window.clearTimeout(t)
  }, [turnoEnCurso, activeSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviarFilaYa = useCallback(() => {
    if (loading) { enviarYaRef.current = true; detencionManualRef.current = true; pauseStreaming(); return }
    soltarFila()
  }, [loading, pauseStreaming, soltarFila])
  // El pendiente regresa ENTERO (texto y adjuntos, en su orden) en un solo cambio del borrador, y sale de la fila
  // en el mismo tick: nunca queda medio mensaje arriba ni sale dos veces (12 oct 2026).
  const editarDeFila = useCallback((id?: string) => {
    if (!composerDraft.ready) return // Con el borrador aún cargando, escribir lo pisaría: la fila no se toca.
    // Editar un mensaje anterior reenvía solo texto: sus fotos se perderían. Se queda en la fila hasta terminar.
    if (composerDraft.value.editingMsgId) { showChatError('Termina o cancela la edición del mensaje anterior antes de traer uno de la fila.'); return }
    const item = cola.sacar(id); if (!item) return
    composerDrafts.update(composerKeyRef.current, EMPTY_CHAT_DRAFT, cur => devolverAlComposer(cur, item))
    requestAnimationFrame(() => { const el = textareaRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
  }, [cola, composerDraft.ready, composerDraft.value.editingMsgId, showChatError])
  // La Cabina: un botón dentro de una vista («Atiéndelo con Levy») envía su
  // pedido como mensaje del dueño, sin copiar y pegar.
  useEffect(() => {
    const enviar = (e: Event) => { const t = (e as CustomEvent<{ texto?: string }>).detail?.texto; if (t?.trim()) handleSendRef.current?.(t) }
    window.addEventListener('cabina:enviar', enviar)
    // Un pedido hecho desde el panel en otra página («Nuevo agente») espera aquí a que el chat abra.
    const pendiente = window.setTimeout(() => {
      let t: string | null = null
      try { t = sessionStorage.getItem('cabina:pendiente'); sessionStorage.removeItem('cabina:pendiente') } catch { /* sin almacenamiento */ }
      if (t?.trim()) handleSendRef.current?.(t)
    }, 900)
    return () => { window.removeEventListener('cabina:enviar', enviar); window.clearTimeout(pendiente) }
  }, [])
  // «Corregir esto» de la vista Memoria (4 oct 2026): deja la cita en la caja SIN enviar; Daniel termina la frase.
  const redactarRef = useRef<(t: string) => void>(() => {})
  redactarRef.current = (t: string) => {
    const actual = composerDraft.value.input
    setInput(actual.trim() ? `${actual}\n\n${t}` : t)
    requestAnimationFrame(() => { const el = textareaRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
  }
  useEffect(() => {
    const redactar = (e: Event) => { const t = (e as CustomEvent<{ texto?: string }>).detail?.texto; if (t?.trim()) redactarRef.current(t) }
    window.addEventListener('cabina:redactar', redactar)
    const pendiente = window.setTimeout(() => {
      let t: string | null = null
      try { t = sessionStorage.getItem('cabina:redactar'); sessionStorage.removeItem('cabina:redactar') } catch { /* sin almacenamiento */ }
      if (t?.trim()) redactarRef.current(t)
    }, 900)
    return () => { window.removeEventListener('cabina:redactar', redactar); window.clearTimeout(pendiente) }
  }, [])
  const onRetryCb = useCallback((text: string) => { handleSendRef.current?.(text) }, [])

  // Memoize message list — prevents re-creating/diffing JSX on every keystroke
  const messagesList = useMemo(() => {
    const items: React.ReactNode[] = []
    let prevDate: string | null = null
    let prevRole: string | null = null
    const now = Date.now()
    const fechasVistas = new Map<string, number>()

    // Orden por TURNO, no por llegada (1 oct 2026): cada turno se ubica por cuándo EMPEZÓ, el user antes
    // que su respuesta, y el turno que transmite siempre al final. Un mensaje re-insertado por realtime, o un
    // par que el webhook guardó al terminar, ya no se cuela después del turno siguiente (lib/orden-turnos).
    // Filas de Daniel que entraron a mitad de un turno se pintan dentro de su actividad (lib/inyecciones).
    const ordered = hiloLimpio(ordenarPorTurno(plegarInyectadas(messages)))

    for (let i = 0; i < ordered.length; i++) {
      const msg = ordered[i]
      const msgDate = msg.timestamp.toDateString()
      if (msgDate !== prevDate) {
        // Con el orden por turno una fecha puede reaparecer (turno que cruza medianoche): key única, estable.
        const veces = fechasVistas.get(msgDate) ?? 0
        fechasVistas.set(msgDate, veces + 1)
        items.push(<DateSeparator key={veces ? `date-${msgDate}-${veces}` : `date-${msgDate}`} date={msg.timestamp} />)
        prevDate = msgDate
        prevRole = null // tras un separador de fecha, el avatar reaparece
      }
      // Ritmo vertical por hablante: racha del mismo rol = gap corto; cambio de
      // rol = gap amplio (jerarquía de turnos tipo Claude). Entrada animada solo
      // para mensajes recién llegados (timestamp fresco) — cargar una sesión
      // vieja NO dispara 60 animaciones.
      const sameRole = prevRole === msg.role
      const isFresh = now - msg.timestamp.getTime() < 3000
      const retryText = msg.role === 'assistant' && msg.error && ordered[i - 1]?.role === 'user'
        && (ordered[i - 1].metadata as { source?: string } | undefined)?.source !== 'cron'
        ? ordered[i - 1].content
        : undefined
      // Render diferido (LazyMessage): solo la COLA de la conversación paga el
      // parseo markdown/highlight al abrir — el resto se materializa al
      // acercarse por scroll. La cola es generosa (12) para cubrir el viewport
      // inicial + el arranque del scroll sin placeholder visible.
      const eager = msg.role === 'user' || i >= ordered.length - 12
      const bubble = (
        <MessageBubble
          msg={msg}
          isFresh={isFresh}
          onAnswerQuestion={answerQuestion}
          retryText={retryText}
          onRetry={retryText ? onRetryCb : undefined}
          onEdit={msg.role === 'user' && (msg.metadata as { source?: string } | undefined)?.source !== 'cron' ? handleStartEdit : undefined}
          connection={msg.streaming ? connection : undefined}
        />
      )
      items.push(
        <div
          key={msg.id}
          data-msg-id={msg.id}
          data-msg-role={msg.role}
          data-msg-streaming={msg.streaming || undefined}
          className={`${items.length === 0 ? '' : sameRole ? 'mt-1.5' : 'mt-5'} rounded-2xl transition-colors duration-700 ${highlightMsgId === msg.id ? 'bg-brand/[0.08] ring-1 ring-inset ring-brand/30' : ''}`}
        >
          {msg.compact && (
            <CompactSeparator
              tokensBefore={msg.compact.tokensBefore}
              tokensAfter={msg.compact.tokensAfter}
            />
          )}
          {eager ? bubble : <LazyMessage text={msg.content}>{bubble}</LazyMessage>}
        </div>
      )
      prevRole = msg.role
    }
    return items
  }, [messages, answerQuestion, onRetryCb, highlightMsgId, handleStartEdit, connection])
  // Los mensajes que ya se pintaron dejan de costar layout mientras están lejos de la pantalla (useFueraDeVista).
  useFueraDeVista(messagesContentRef, messagesList)
  // Vigía del hilo (12 oct 2026, ver lib/hilo-vigia.ts): al abrir o restaurar una conversación, si a los 1.5 s hay
  // mensajes y ninguno se ve (scroll en un hueco o todos saltados por content-visibility), se cura y se registra.
  const hayMensajes = messages.length > 0
  const sesionVigilada = activeSession?.id ?? null
  useEffect(() => {
    if (!hayMensajes || loadingSession) return
    let vivo = true
    const revisar = async () => {
      const el = messagesContainerRef.current, contenido = messagesContentRef.current
      if (!el || !contenido || el.clientHeight < 40) return
      const antes = medirHilo(el, contenido)
      if (!antes.vacio) return
      curarHilo(el, contenido)
      isAtBottomRef.current = true
      setShowScrollBtn(false)
      await despuesDePintar()
      if (!vivo || !messagesContainerRef.current || !messagesContentRef.current) return
      // Verificar: la cura solo cuenta si ahora se ve un mensaje. Si no, un segundo intento y el reporte honesto.
      let despues = medirHilo(el, contenido)
      if (despues.vacio) { curarHilo(el, contenido); await despuesDePintar(); if (!vivo) return; despues = medirHilo(el, contenido) }
      reportarHilo({
        tipo: 'vacio', mensaje: 'hilo vacío a la vista tras abrir la conversación', sesion: sesionVigilada,
        detalle: { ...antes.detalle, curado: !despues.vacio, despues: despues.detalle },
      })
    }
    // A los 1.5 s de abrir y otra vez a los 6 s: el hueco también nace cuando llega el markdown o termina un turno.
    const t1 = window.setTimeout(revisar, 1500), t2 = window.setTimeout(revisar, 6000)
    return () => { vivo = false; clearTimeout(t1); clearTimeout(t2) }
  }, [sesionVigilada, hayMensajes, loadingSession])
  // Detector de la rueda que no mueve el hilo (19 oct 2026, lib/rueda-vigia.ts): solo telemetría, escuchas pasivas.
  // Si un gesto sobre el hilo no lo movió sin estar en el borde, deja un registro con el estado del pin y del turno.
  useEffect(() => vigilarRueda(
    () => messagesContainerRef.current,
    () => {
      const ahora = Date.now(), candado = anchorLockRef.current
      return {
        cargando: chatLoadingRef.current, alFondo: isAtBottomRef.current,
        asentandoMs: Math.max(0, pinSettleUntilRef.current - ahora),
        candadoAnclaMs: candado ? Math.max(0, candado.until - ahora) : null,
        anclaTurno: anchorActiveRef.current, anclaPendiente: anchorPendingRef.current,
        restaurarPendiente: restoreScrollRef.current != null, pinPendiente: pinToBottomRef.current,
        anteponiendo: prependAnchorRef.current != null, cargandoAnteriores: loadingOlderRef.current,
      }
    },
    () => activeSessionRef.current?.id ?? null,
  ), [])

  const liveActions = useRef({ send: handleSend, interrupt: pauseStreaming, newChat: handleNewChat, answerQuestion })
  liveActions.current = { send: handleSend, interrupt: pauseStreaming, newChat: handleNewChat, answerQuestion }
  useEffect(() => {
    onLiveController?.({ owner: profile?.id ?? null, account, sessionId: activeSession?.id ?? null, messages, loading, model: currentModel,
      send: (text, opts) => { void liveActions.current.send(text, opts) }, backgroundBusy: !!messages.findLast(m => m.role === 'assistant')?.tasks?.some(t => t.status === 'running'), interrupt: () => { void liveActions.current.interrupt() }, newChat: () => liveActions.current.newChat(), answerQuestion: (id, answers) => liveActions.current.answerQuestion(id, answers) })
  }, [onLiveController, profile?.id, account, activeSession?.id, messages, loading, currentModel])

  return (
    <AudioProvider>
    <div className="flex h-full min-h-0 overflow-hidden relative bg-background/40">
      {/* Mobile overlay backdrop */}
      {chatSessionsPanelOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-10 md:hidden"
          onClick={closeChatSessionsPanel}
        />
      )}

      {/* Sessions sidebar — cerrado queda fuera de pantalla (transform/w-0) pero
          seguía en el árbol de accesibilidad; inert lo oculta también para
          iOS Speak Screen ("Abrir lector"). */}
      <div
        inert={!chatSessionsPanelOpen}
        aria-hidden={!chatSessionsPanelOpen}
        className={`
        ${chatSessionsPanelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${chatSessionsPanelOpen ? 'md:w-64' : 'md:w-0 md:overflow-hidden'}
        fixed md:relative z-20 md:z-0
        w-64 h-full
        bg-surface/95 md:bg-transparent backdrop-blur-xl
        transition-all duration-300 ease-in-out
      `}>
        <ChatSessions
          sessions={sesionesDeLista}
          loading={history.loading}
          error={history.loadError}
          activeId={activeSession?.id ?? null}
          crons={showCronsTab}
          onCrons={(v) => { if (v) handleTabChange('crons'); else setShowCronsTab(false) }}
          onSelect={(session) => { handleSelectSession(session); closeChatSessionsPanel() }}
          onNew={() => { handleNewChat(); closeChatSessionsPanel() }}
        />
      </div>

      {/* Chat area */}
      <div ref={chatAreaRef} className="chat-area flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Cabecera del chat (1 oct, pedido del dueño): dos botones, nueva conversación y el
            panel a la derecha. Levy al centro abre la lista de conversaciones; el modelo se
            cambia en el composer. Solo escritorio: en el teléfono la pinta el Header global. */}
        <div data-cabecera-chat className="titanium-header shrink-0 relative hidden md:flex items-center justify-end px-4 py-3 border-b border-border-subtle z-10">
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 pointer-events-auto select-none">
            {/* 4 oct 2026, pedido del dueño: todo el bloque de Levy (foto + nombre) es un solo botón,
                hablar con Levy en persona (avatar 3D con voz, pestaña Live). La lista de conversaciones
                es la barra izquierda; cuenta y modelo viven en la píldora del composer. */}
            <button
              onClick={() => window.dispatchEvent(new Event('openclaw:go-live'))}
              onPointerEnter={() => window.dispatchEvent(new Event('openclaw:prepare-live'))}
              onFocus={() => window.dispatchEvent(new Event('openclaw:prepare-live'))}
              onTouchStart={() => window.dispatchEvent(new Event('openclaw:prepare-live'))}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-card-hover active:scale-[0.98] transition-all"
              title="Hablar con Levy en persona"
              aria-label="Hablar con Levy en persona"
            >
              <span className="relative shrink-0">
                <Retrato agente="levy" size={32} prioridad className="w-8 h-8 rounded-full object-cover border border-primary/40 shadow-depth-rest-soft" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border border-background" />
              </span>
              <span className="text-sm font-semibold text-foreground">Levy</span>
            </button>
            <AgentesTrabajando />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleNewChat()}
              title="Nueva conversación"
              aria-label="Nueva conversación"
              className="icon-btn size-8"
            >
              <Plus size={14} />
            </button>
            {headerAction}
          </div>
        </div>

        {/* TEMPORAL (2026-07-08): banner de cuenta activa. Siempre visible (desktop
            y móvil) mientras chateas en la segunda cuenta, para que nunca haya
            duda de qué suscripción factura el turno. Se oculta en el espacio 'Tú'. */}
        {connection === 'online' && account === 'bro' && (
          <div className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-1.5 bg-brand/10 border-b border-brand/20 text-[11px] text-brand-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span>Corriendo en <strong className="font-semibold">bro-claude</strong> · {bannerCuenta('bro')}</span>
          </div>
        )}
        {/* Espacio codex (4 sep 2026): Levy sobre OpenAI vía Codex CLI, ChatGPT Pro del dueño. */}
        {connection === 'online' && account === 'codex' && (
          <div className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 text-[11px] text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Corriendo en <strong className="font-semibold">codex</strong> · OpenAI con tu ChatGPT Pro</span>
          </div>
        )}
        {/* Estado de la CONEXIÓN del teléfono (M2): separado de la actividad del
            agente. El host sigue trabajando sin este stream; al volver la red el
            reenganche recupera lo que falte. */}
        {connection !== 'online' && (
          <div role="status" data-connection={connection} className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-200">
            <span className={`w-1.5 h-1.5 rounded-full ${connection === 'offline' ? 'bg-amber-400' : 'bg-amber-300 motion-safe:animate-pulse'}`} />
            <span>{connection === 'offline' ? 'Sin conexión · lo enviado sigue trabajando en el servidor' : 'Reconectando con el servidor…'}{account !== 'default' && <span className="text-amber-200/70"> · {account}</span>}</span>
            {/* «Reintentar» (29 oct 2026): enciende el motor si no responde y recarga; uno sano nunca se reinicia. */}
            <BotonReintentar className="ml-2 border-amber-300/40 text-amber-100 hover:bg-amber-500/20" />
          </div>
        )}
        {/* Espacio yt (6 sep 2026): mismo motor Codex, la segunda cuenta de OpenAI. */}
        {connection === 'online' && account === 'yt' && (
          <div className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20 text-[11px] text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Corriendo en <strong className="font-semibold">yt</strong> · {bannerCuenta('yt')}</span>
          </div>
        )}

        {/* Global audio bar — appears when audio is playing */}
        <GlobalAudioBar />

        {/* Barra flotante de lectura por voz del dispositivo (⏮ ⏯ ⏭ · velocidad · ✕) */}
        <ChatSpeechBar />
        <LectorPosicion sessionId={activeSession?.pendingCreation ? null : activeSession?.id} messageIds={messages.map(m => m.id)} />
        <TtsProbeOverlay />

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={messagesContainerRef}
            data-arbrain-scroll="chat"
            onScroll={handleMessagesScroll}
            data-scroll-region
            className="absolute inset-0 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4"
          >
            {loadingSession ? (
              // Skeleton neutro alineado a la izquierda — las conversaciones
              // reales están dominadas por respuestas de Levy (menos reflow).
              <div className="chat-prose flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`h-10 rounded-2xl bg-card animate-pulse ${i === 2 ? 'w-1/2' : 'w-3/4'}`} />
                ))}
              </div>
            ) : messages.length === 0 && !loading ? (
              // Estado vacío (v2, 30 sep noche): el referente es claude.ai — saludo serif
              // según la hora, el rostro de Levy como sello y el campo justo debajo
              // (en escritorio el composer sube a acompañarlo; en el teléfono se queda
              // abajo, al alcance del pulgar). Atajos sin emoji, en una sola línea tranquila.
              <div className="chat-vacio flex flex-col items-center justify-end h-full text-center px-6 pb-6 md:pb-8">
                <div className="chat-vacio-titular">
                  {!liveMode && <LevyFace className="chat-vacio-sello shrink-0 border border-brand/25" />}
                  <p className="chat-vacio-saludo" suppressHydrationWarning>
                    {saludoPorHora()}{profile?.full_name && !(EDICION_CLIENTE && profile.full_name === NOMBRE_SIN_DAR) ? `, ${profile.full_name.split(' ')[0]}` : ''}
                  </p>
                </div>
                <div className="chat-vacio-atajos">
                  {/* Edición cliente: los pedidos del alumno (su cerebro está vacío; sin agenda, métricas ni YouTube). */}
                  {(EDICION_CLIENTE ? PEDIDOS_BIENVENIDA.map(p => ({ label: p.etiqueta, prompt: p.texto })) : [
                    { label: 'Mi día', prompt: '¿Qué tengo hoy? Muéstrame el día.' },
                    { label: 'El negocio', prompt: '¿Cómo van las métricas del negocio hoy?' },
                    { label: 'Lo que llegó', prompt: 'Resume lo más importante de mis últimos reportes.' },
                    { label: 'Ideas de video', prompt: 'Dame 3 ideas para el próximo video de YouTube' },
                  ]).map((s) => (
                    <button key={s.label} onClick={() => handleSend(s.prompt)} className="chat-vacio-atajo">
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Columna de lectura centrada (48–52rem, modelo Claude/ChatGPT); las
              // vistas, tablas y código salen de ella al carril ancho (.chat-wide).
              <div ref={messagesContentRef} className="chat-prose">
                {hasMoreHistory && (
                  <div aria-hidden className="flex justify-center pb-1">
                    <button
                      onClick={() => loadOlderRef.current?.()}
                      disabled={loadingOlder}
                      className="px-3 py-1.5 rounded-full text-[11px] font-medium text-muted/80 bg-card hover:bg-card-hover border border-border-subtle transition-colors disabled:opacity-50"
                    >
                      {loadingOlder ? 'Cargando…' : 'Ver mensajes anteriores'}
                    </button>
                  </div>
                )}
                <HiloSeguro sessionId={activeSession?.id ?? null}><CabinaProvider messages={messages}>{messagesList}</CabinaProvider></HiloSeguro>

                {/* Edición cliente (v1.1): bajo el primer mensaje de Levy, sus tres pedidos son botones de un clic que
                    envían ese mensaje tal cual. Desaparecen en cuanto la persona escribe o toca uno. */}
                {EDICION_CLIENTE && !loading && soloBienvenida(messages) && (
                  <div role="group" aria-label="Para empezar" className="flex flex-wrap gap-2 pt-3" data-pedidos-bienvenida>
                    {PEDIDOS_BIENVENIDA.map((p) => (
                      <button
                        key={p.texto}
                        type="button"
                        onClick={() => handleSend(p.texto)}
                        title={p.para.charAt(0).toUpperCase() + p.para.slice(1)}
                        className="min-h-10 max-w-full rounded-full border border-brand/25 bg-brand/[0.08] px-3.5 py-2 text-left text-[13px] text-brand-ink
                          hover:border-brand/45 hover:bg-brand/15 active:scale-[0.98] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {p.texto}
                      </button>
                    ))}
                  </div>
                )}

                {/* Follow-up suggestions (promptSuggestions del SDK) — chips
                    tocables bajo el último mensaje, solo cuando el turno terminó. */}
                {!loading && suggestions.length > 0 && (
                  <div aria-hidden className="flex flex-wrap gap-1.5 pt-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="max-w-full truncate px-3 py-1.5 rounded-full text-[11px] text-left
                          text-brand-ink/90 bg-brand/[0.07] border border-brand/20
                          hover:bg-brand/15 hover:border-brand/40 active:scale-[0.98]
                          transition-all duration-150"
                        title={s}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Spacer del turno anclado — reserva viewport para la respuesta.
                    Altura manejada imperativamente (updateTurnSpacer) para no
                    re-renderizar la lista en cada delta del stream. */}
                <div ref={turnSpacerRef} aria-hidden className="shrink-0" />
              </div>
            )}

            <div ref={bottomRef} />

            {/* «Ir al final», DENTRO del hilo (21 oct 2026, pedido: «no puedo hacer scroll con esta UI»). Antes era un
                hermano absoluto encima del hilo: la rueda o el dedo sobre él no tenían contenedor con scroll en su
                cadena y el hilo no se movía (bitácora hilo-rueda: los dos atascos del 21 oct, con el puntero sobre
                este botón). Pegado al fondo con sticky en una fila de alto 0: no suma altura al hilo y el gesto que
                empieza sobre él desplaza el hilo como cualquier mensaje. */}
            {showScrollBtn && (
              <div data-ir-al-final className="sticky bottom-3 z-10 flex h-0 justify-center pointer-events-none">
                <button
                  onClick={scrollToBottom}
                  className="pointer-events-auto -translate-y-full
                    icon-btn rounded-full
                    hover:bg-card-hover active:scale-90"
                  title="Ir al final"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Hidden file input for image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        <input
          ref={docInputRef}
          type="file"
          accept={ACCEPT_DOCUMENTOS}
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />

        {/* TTS reads data-tts-content only; composer controls remain accessible. */}
        <DespertadoresAviso conversationId={activeSession?.id} account={activeSession?.account ?? account} refrescar={loading} />
        {EDICION_CLIENTE && <ColaDelHilo conversationId={activeSession?.id} />}
        <ChatDraftStatus key={JSON.stringify([profile?.id, account, activeSession?.id])} owner={profile?.id} account={account} conversationId={activeSession?.id} sendingTurnId={loading ? messages.findLast(message => message.role === 'assistant' && message.streaming)?.metadata?.turnId : null} onAccepted={(id, destinationAccount) => { void resumeStream(id, destinationAccount) }} />
        <div data-tts-exclude data-chat-composer className="chat-input-toolbar shrink-0" data-vacio={(messages.length === 0 && !loading && !loadingSession && !liveMode) || undefined}>
          <div className="px-3 pt-2 pb-3 md:px-4 md:pt-2.5 md:pb-3">
            {/* Mismo ancho que la columna de mensajes — composer alineado al contenido */}
            <div className="relative chat-prose">
              {paletteQuery !== null && (
                <CommandPalette
                  comandos={comandosFiltrados}
                  selectedIndex={paletteSelectedIndex}
                  onSelect={handleCommandSelect}
                  onClose={() => { setPaletteQuery(null); setPaletteSelectedIndex(0) }}
                />
              )}
              {showModelPicker && (
                <ModelPicker
                  onSelect={handleModelSelect}
                  onClose={() => setShowModelPicker(false)}
                  account={account}
                  modeloActual={currentModel}
                  conversacionConMensajes={messages.length > 0}
                  cuentas={CHAT_TABS.filter(t => t.id !== 'crons')}
                  onCuenta={(c) => { setShowModelPicker(false); handleTabChange(c) }}
                />
              )}
              {showEffortSlider && (
                <EffortSlider
                  effort={currentEffort}
                  ultracode={ultracode}
                  account={account}
                  sessionId={activeSession?.pendingCreation ? null : activeSession?.id}
                  model={currentModel}
                  onSelect={handleEffortStopSelect}
                  onClose={() => setShowEffortSlider(false)}
                />
              )}
              {showContexto && contextoConversacion && (
                <ContextoDetalle contexto={contextoConversacion} account={account} onClose={() => setShowContexto(false)} />
              )}


              {/* Barra de edición: se está reescribiendo un mensaje pasado */}
              {editingMsgId && (
                <div className="mb-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-brand/[0.08] border border-brand/25 text-[12px]">
                  <span className="flex items-center gap-1.5 text-brand min-w-0">
                    <Pencil size={12} className="shrink-0" />
                    <span className="truncate">Editando mensaje · se descarta lo que sigue</span>
                  </span>
                  <button
                    onClick={handleCancelEdit}
                    className="shrink-0 text-muted hover:text-foreground transition-colors"
                    title="Cancelar edición (Esc)"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {hasUltrathink(input) && (
                <div className="mb-2 mr-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-primary/25 bg-gradient-to-r from-pink-500/10 via-primary/10 to-cyan-500/10 align-middle">
                  <span className="bg-gradient-to-r from-pink-400 via-violet-400 via-cyan-400 to-amber-400 bg-clip-text text-transparent font-bold tracking-wider">
                    ULTRATHINK
                  </span>
                  <span className="text-muted">· thinking max activado</span>
                </div>
              )}

              {hasUltracodeWord(input) && (
                <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-brand/30 bg-brand/10 align-middle">
                  <span className="text-brand-ink font-bold tracking-wider">ULTRACODE</span>
                  <span className="text-muted">· orquestación multi-agente este turno</span>
                </div>
              )}

              {composerDraft.error && <p role="alert" className="text-sm text-amber-600">{composerDraft.error}</p>}
              {chatError && (
                <div className="mb-2 px-3 py-2 rounded-xl bg-error/10 border border-error/25 text-[12px] text-error flex items-center justify-between gap-3">
                  <span className="leading-snug">{chatError}</span>
                  <button
                    onClick={() => setChatError(null)}
                    className="shrink-0 text-error/60 hover:text-error transition-colors"
                    aria-label="Cerrar"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Línea de estado fija (25 oct 2026): qué hace Levy · N pasos · tiempo, cuando su turno quedó fuera de la vista. */}
              <LineaFija msg={messages[messages.length - 1]} connection={connection} />

              {/* La meta activa (27 oct 2026): texto, estado y Pausar/Quitar sin teclear `/goal`. */}
              <ChipMeta meta={metaDelHilo} ocupado={metaAccionando} onPausar={() => void accionMeta('pausar')} onReanudar={() => void accionMeta('reanudar')} onQuitar={() => void accionMeta('quitar')} />

              <ColaMensajes items={cola.items} pausada={cola.pausada} trabajando={loading}
                onEditar={editarDeFila} onQuitar={cola.quitar} onEnviarYa={enviarFilaYa} />

              {/* Adjuntos, texto y controles comparten una sola caja en móvil y desktop. */}
              <div className={`msg-composer ${composerUI.frame}`}>
                {(textFiles.length>0||pendingImages.length>0||imagenesSubidas.length>0||preparingImages>0)&&<div className={composerUI.attachments}>
              <TextAttachmentTray files={textFiles} onRemove={i => setTextFiles(old => old.filter((_, j) => i !== j))} onChange={(i, content) => setTextFiles(old => old.map((f, j) => i === j ? { ...f, content } : f))}/>
              {/* Los que regresaron de la fila (ya subidos) van primero: así salen. */}
              {imagenesSubidas.map((url,i)=>{const quitar=()=>setImagenesSubidas(prev=>prev.filter((_,j)=>j!==i)); return esUrlDeDocumento(url)
                ? <DocumentoPendiente key={`s${i}`} nombre={nombreDesdeUrl(url)} onRemove={quitar}/>
                : <ImageAttachmentCard compact key={`s${i}`} file={{name:`Imagen ${i+1}`,content:urlPublicaDeStorage(url)}} onRemove={quitar}/>})}
              {pendingImages.map((img,i)=>esDocumentoAceptado(img.file)
                ? <DocumentoPendiente key={i} nombre={img.file.name} bytes={img.file.size} onRemove={()=>removePendingImage(i)}/>
                : <ImageAttachmentCard compact key={i} file={{name:img.file.name,content:img.previewUrl}} onRemove={()=>removePendingImage(i)}/>)}
              {preparingImages>0&&<span role="status" className="text-xs text-muted self-center">Preparando {preparingImages===1?'archivo':'archivos'}…</span>}
              {uploadingImage&&<span role="status" className="text-xs text-muted self-center">Subiendo archivos…</span>}
                </div>}
                {/* Controles fijos debajo del texto. */}
                <div className={composerUI.controls}>
                  {/* Adjuntar: «+» abre fotos o documentos (2 oct 2026). */}
                  <MenuAdjuntar
                    disabled={loading || loadingSession || uploadingImage}
                    onFotos={() => fileInputRef.current?.click()}
                    onDocumentos={() => docInputRef.current?.click()}
                    onConsejo={onConsejo}
                  />

                  {/* Chip de MODELO — solo móvil (en desktop vive en el header del
                      chat). Abre el mismo ModelPicker que el header. */}
                  <button
                    onClick={() => setShowModelPicker(true)}
                    aria-label={EDICION_CLIENTE ? 'Modelo, permisos y Pausar todo' : 'Cambiar modelo y cuenta'}
                    aria-expanded={showModelPicker}
                    title={EDICION_CLIENTE ? 'Modelo, Autónomo o Preguntar, y Pausar todo' : 'Cambiar modelo y cuenta'}
                    className={composerUI.model}
                  >
                    {/* Autónomo (30 oct 2026): un punto discreto; el modo y «Pausar todo» se cambian en este menú. */}
                    {EDICION_CLIENTE && <PuntoAutonomo />}
                    <span className="text-[12.5px] font-medium truncate">
                      {modelDisplayName(currentModel) ?? 'Modelo'} · {CHAT_TABS.find(t => t.id === account)?.label ?? account}
                    </span>
                    <ChevronDown size={11} className="shrink-0 text-muted/70" />
                  </button>

                  {/* Esfuerzo y orquestación son controles separados. */}
                  <button
                    data-effort-chip
                    onClick={() => setShowEffortSlider((v) => !v)}
                    aria-label="Nivel de esfuerzo"
                    aria-expanded={showEffortSlider}
                    title="Configurar razonamiento"
                    className={`shrink-0 flex items-center min-h-11 min-w-11 md:min-h-8 md:min-w-0 rounded-full px-3 border text-[12px] font-medium transition-colors select-none ${
                      ultracode
                        ? 'bg-brand/10 border-brand/40 text-brand-ink'
                        : 'bg-card border-border text-foreground/70 hover:text-foreground hover:bg-card-hover'
                    }`}
                  >
                    {stopLabel(currentEffort, ultracode)}
                  </button>

                  {/* Contexto de ESTA conversación: anillo + «8 %»; detalle al tocar. */}
                  <ContextoChip contexto={contextoConversacion} open={showContexto} onToggle={() => setShowContexto(v => !v)} />
                </div>
                <div className={`relative ${composerUI.inputRegion}`}>
                  {/* Highlight overlay — only mounted when the user actually typed
                      a magic word. The ghost-overlay technique (transparent textarea
                      + visible div mirror) is the only way to color individual tokens
                      inside a textarea, but it has a hard tradeoff: when content
                      overflows max-h the textarea auto-scrolls to follow the caret
                      and the overlay can desync, leaving the caret floating over
                      empty space. We avoid that 99% of the time by keeping the
                      textarea fully visible unless we genuinely need the rainbow. */}
                  {showOverlay && (
                    <div
                      ref={overlayRef}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-[15px] md:text-sm leading-snug py-1 overflow-hidden"
                    >
                      <HighlightedInputOverlay value={input} />
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    aria-label="Mensaje"
                    // Región scrolleable propia: el textarea largo scrollea con
                    // el dedo (max-h 200px) y permite selección de texto en móvil.
                    // Exenta del preventDefault global de touchmove (dashboard-shell).
                    data-scroll-region
                    readOnly={!composerDraft.ready} value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onScroll={(e) => {
                      if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop
                    }}
                    placeholder={textFiles.length > 0 ? '¿Qué hacemos con el texto?' : pendingImages.length + imagenesSubidas.length > 0 ? 'Agrega un mensaje o envía...' : 'Mensaje...'}
                    rows={1}
                    disabled={loadingSession}
                    className="chat-input-scroll relative w-full bg-transparent text-[15px] md:text-sm placeholder:text-muted/50 resize-none outline-none min-h-[28px] leading-snug py-1 disabled:opacity-50"
                    style={showOverlay ? {
                      // Hide the textarea's own glyphs only while the rainbow overlay
                      // is mounted on top. Caret stays visible via caretColor.
                      color: 'transparent',
                      caretColor: 'var(--primary)',
                      WebkitTextFillColor: 'transparent',
                    } : { color: 'var(--foreground)' }}
                  />
                </div>
                {/* Acción — móvil: extremo derecho de la barra inferior · desktop: fin de fila */}
                <div className={`${composerUI.action} flex items-center gap-1.5`}>
                {/* Un solo botón (1 oct 2026): Levy trabajando + caja vacía = detener; en cuanto
                    hay texto, archivo o foto = enviar (con turno activo, entra a la fila). Recién
                    enviado, detener queda desarmado un instante: un doble clic no interrumpe. */}
                {boton === 'detener' ? (
                  <button
                    key="detener"
                    onPointerDown={(e) => { e.preventDefault(); startHoldStop() }}
                    onPointerUp={endHoldStop}
                    onPointerLeave={endHoldStop}
                    onPointerCancel={endHoldStop}
                    title="Tap: pausar · Mantén presionado: descartar el turno"
                    aria-label="Detener respuesta. Tap para pausar, mantén presionado para descartar el turno."
                    data-armado={detenerListo || undefined}
                    className={`${botonEnviar.enviar} ${botonEnviar.detener} ${detenerListo ? '' : 'opacity-40'} ${holdingStop ? botonEnviar.sosteniendo : ''}`}
                  >
                    {holdingStop && (
                      <svg className="msg-stop-ring" viewBox="0 0 36 36" aria-hidden>
                        <circle cx="18" cy="18" r="16" />
                      </svg>
                    )}
                    {/* Cuadrito relleno estilo Claude — calmado, sin alarma */}
                    <span className="block w-[11px] h-[11px] md:w-[10px] md:h-[10px] rounded-[2.5px] bg-current" aria-hidden />
                  </button>
                ) : boton === 'enviar' ? (
                  <button
                    key="enviar"
                    onMouseDown={(e) => {
                      // Prevent textarea blur so the click fires immediately on desktop too
                      e.preventDefault()
                    }}
                    onTouchEnd={(e) => {
                      // On mobile Safari, tapping the send button while the keyboard is open
                      // causes a blur/reflow that swallows the first tap. By handling onTouchEnd
                      // and preventing default, we fire the send immediately on the first tap.
                      e.preventDefault()
                      handleSend()
                    }}
                    onClick={() => handleSend()}
                    disabled={!composerDraft.ready || loadingSession}
                    aria-label="Enviar"
                    title={loading ? 'Enviar: sale cuando Levy termine (Enter)' : 'Enviar (Enter)'}
                    className={botonEnviar.enviar}
                  >
                    <ArrowUp strokeWidth={2.5} aria-hidden />
                  </button>
                ) : EDICION_CLIENTE && llaveVoz !== true ? (
                  // Edición cliente sin llave de Groq (21 oct 2026): el micrófono lleva a Ajustes › Voz, que explica cómo
                  // conseguirla gratis. Con la llave, el dictado de abajo transcribe en SU daemon.
                  <button type="button" onClick={irAjustesVoz} disabled={loadingSession}
                    aria-label="Dictar: agrega tu llave de Groq (gratis) en Ajustes › Voz"
                    title="Para dictar, agrega tu llave de Groq (gratis) en Ajustes › Voz"
                    className="shrink-0 w-11 h-11 md:w-8 md:h-8 rounded-xl flex items-center justify-center transition-all text-muted/80 hover:text-foreground/70 hover:bg-card-hover disabled:opacity-50">
                    <Mic size={16} className="md:w-[13px] md:h-[13px]" />
                  </button>
                ) : (
                  <VoiceInput
                    onVoiceNote={EDICION_CLIENTE ? notaVozCliente : handleVoiceNote}
                    disabled={loadingSession}
                    soloTexto={EDICION_CLIENTE}
                    onSinConfigurar={EDICION_CLIENTE ? irAjustesVoz : undefined}
                  />
                )}
                </div>
              </div>
            </div>
          </div>
          <div className="safe-area-spacer shrink-0" />
        </div>
      </div>
    </div>
    </AudioProvider>
  )
}
