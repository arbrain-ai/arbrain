'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Plus, Paperclip, Square, MessageSquare, SlidersHorizontal, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { MarkdownMessage } from './MarkdownMessage'
import { VoiceInput } from './VoiceInput'
import { ConsejoMessageActions } from './ConsejoMessageActions'
import { ConsejoSettings, type ModelSettings } from './ConsejoSettings'
import { QuestionCard } from './QuestionCard'
import type { QuestionPrompt } from '../hooks/useChat'
import { ChatSpeechBar } from './ChatSpeechBar'
import { saveEnvelope, pendingEnvelopes, acknowledgeEnvelope } from '../lib/consejo-outbox'
import { chatSpeech } from '../lib/chat-speech'
import { CHAT_ACCOUNTS, type ChatAccount } from '../stores/account-store'
import styles from './consejo.module.css'
import { ChatAccountTabs } from './ChatAccountTabs'
import { ConsejoButton } from './ConsejoButton'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { TextAttachmentCard, UserMessageText } from './TextAttachmentCard'
import { isLongText, pastedTextFile, presentUserText, textAttachmentError } from '../lib/text-attachments'
import { clipboardImages, localImagePath, readPastedImage } from '../lib/image-paste'
import { DEFAULT_CONSEJO_MODELS, exactModelLabel, restoreConsejoModels } from '../lib/consejo-models'
import { ImageAttachmentCard } from './ImageAttachmentCard'
import composerUI from './composer-ui.module.css'
import {resizeComposer} from '../lib/composer-size'
import {useComposerDraft} from '../hooks/useComposerDraft'
import {composerDraftKey,composerDrafts} from '../lib/composer-drafts'

type Provider = 'claude' | 'openai'
type Stage = Provider | 'synthesis'
type State = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled'
interface Attachment { name: string; type: 'text' | 'image'; content: string }
interface ResponseRef {turnId:string;source:Stage}
interface ToolTrace {id:string;name:string;input:Record<string,unknown>;state:State;text?:string;error?:string;identity?:{model:string;account:string};cached?:boolean}
interface Proposal { tools?:ToolTrace[]; state: State; text?: string; error?: string; identity?: { account: string; model: string }; startedAt?: number; endedAt?: number }
interface Turn { target?:'both'|Provider; references?:ResponseRef[]; settings?:ModelSettings; mode?:'deliberation'|'execution'; execution?: Proposal & {progress?:{status:string;questions:QuestionPrompt[]}}; contextPreparation?: {state: State; error?: string}; contextVersion?: number; revision: number; id: string; branchId: string; parentId: string | null; message: string; attachments: Attachment[]; state: State; final?: string; delivery?: 'integrated' | 'execution' | Provider; proposals: Record<Stage, Proposal> }
interface Conversation { id: string; rootBranchId: string; title: string; createdAt?: number }
interface Snapshot { conversation: Conversation; turns: Turn[] }
interface Envelope { target?:'both'|Provider; references?:ResponseRef[]; settings?:ModelSettings; action: 'submit'; conversationId: string; turnId: string; branchId: string; parentId: string | null; message: string; attachments: Attachment[]; editTurnId?: string }
const label: Record<Stage, string> = { claude: 'Claude', openai: 'OpenAI', synthesis: 'Levy · integración' }
const status: Record<State, string> = { pending: 'En espera', running: 'En curso', complete: 'Lista', failed: 'No completada', cancelled: 'Cancelada' }
async function api(body: unknown) {
  const response = await fetch('/api/chat/consejo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo alcanzar Consejo.')
  return data
}
function lineage(turns: Turn[], branch: string): Turn[] {
  const result: Turn[] = []; let current = turns.filter(t => t.branchId === branch).at(-1)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) { result.unshift(current); seen.add(current.id); current = turns.find(t => t.id === current?.parentId) }
  return result
}
const EMPTY_DRAFT={text:'',attachments:[] as Attachment[],edit:null as Pick<Turn,'id'|'parentId'>|null,references:[] as ResponseRef[],branch:''}
export function ConsejoPanel({ onAccount }: { onAccount: (account: ChatAccount) => void }) {
  const [sessions, setSessions] = useState<Conversation[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [ownerId,setOwnerId]=useState('')
  const draftKey=composerDraftKey(ownerId,'consejo',selected)
  const draft=useComposerDraft(draftKey,EMPTY_DRAFT)
  const {text,attachments,edit,references,branch}=draft.value
  const {text:setText,attachments:setAttachments,edit:setEdit,references:setReferences,branch:setBranch}=draft.setters
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preparingImage, setPreparingImage] = useState(false)
  const attachmentEpoch = useRef(0)
  const attachmentLock = useRef(false)
  const sidebar = useLayoutStore(s => s.chatSessionsPanelOpen)
  const toggleSidebar = useLayoutStore(s => s.toggleChatSessionsPanel)
  const closeSidebar = useLayoutStore(s => s.closeChatSessionsPanel)
  const [pending, setPending] = useState<Envelope | null>(null)
  const [settings, setSettings] = useState<ModelSettings>()
  const [visible,setVisible]=useState<Record<string,boolean>>({})
  const isReferenced=(turnId:string,source:Stage)=>references.some(r=>r.turnId===turnId&&r.source===source)
  const toggleReference=(turnId:string,source:Stage)=>setReferences(old=>old.some(r=>r.turnId===turnId&&r.source===source)?old.filter(r=>r.turnId!==turnId||r.source!==source):[...old,{turnId,source}].slice(-12))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const owner = useRef('')
  const selectedRef = useRef<string | null>(null)
  const snapshotRef = useRef<Snapshot | null>(null)
  const submissionLock = useRef(false)
  const feed = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const file = useRef<HTMLInputElement>(null)
  const textarea=useRef<HTMLTextAreaElement>(null)
  useEffect(()=>{if(textarea.current)resizeComposer(textarea.current)},[text,selected])
  useEffect(()=>{const resize=()=>{if(textarea.current)resizeComposer(textarea.current)}; window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{window.visualViewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize)}},[])
  const key = useCallback((suffix: string) => `consejo:${owner.current}:${suffix}`, [])
  const accept = useCallback((data: Snapshot) => {
    if (selectedRef.current !== data.conversation.id) return
    const previous = snapshotRef.current
    if (previous?.conversation.id === data.conversation.id) {
      data.turns = data.turns.map(t => { const old = previous.turns.find(p => p.id === t.id); return old && old.revision > t.revision ? old : t })
    }
    snapshotRef.current = data; setSnapshot(data)
    setPending(old => {
      if (old && data.turns.some(t => t.id === old.turnId)) { acknowledgeEnvelope(localStorage,key('pending'),old.turnId); return pendingEnvelopes<Envelope>(localStorage,key('pending'))[0] ?? null }
      return old
    })
  }, [key])
  const refresh = useCallback(async (id: string) => {
    try { accept(await api({ action: 'snapshot', conversationId: id })); setError('') }
    catch (e) { if (selectedRef.current === id) setError((e as Error).message) }
  }, [accept])
  const select = useCallback(async (session: Conversation) => {
    attachmentEpoch.current++
    chatSpeech?.stop(); selectedRef.current = session.id; snapshotRef.current = null
    setSelected(session.id); setSnapshot(null); if (window.matchMedia('(max-width: 767px)').matches) closeSidebar(); atBottom.current = true
    localStorage.setItem(key('selected'), session.id)
    const data: Snapshot = await api({ action: 'snapshot', conversationId: session.id })
    if (selectedRef.current !== session.id) return
    const last = data.turns.at(-1)
    const savedModels = (suffix:string) => { try { const raw=localStorage.getItem(key(suffix)); return raw?JSON.parse(raw) as ModelSettings:undefined } catch { return undefined } }
    setSettings(restoreConsejoModels(last,savedModels(`models:${session.id}`),savedModels('models')))
    const destination=composerDraftKey(owner.current,'consejo',session.id)
    await composerDrafts.load(destination,EMPTY_DRAFT)
    if(selectedRef.current!==session.id) return
    if(!composerDrafts.entry(destination,EMPTY_DRAFT).value.branch) composerDrafts.update(destination,EMPTY_DRAFT,old=>({...old,branch:last?.branchId??session.rootBranchId}))
    accept(data)
  }, [accept, key, closeSidebar])
  useEffect(() => {
    if(window.matchMedia('(max-width:767px)').matches) useLayoutStore.getState().closeConversationsDrawer()
    let mounted = true
    void api({ action: 'list' }).then(async data => {
      if (!mounted) return
      owner.current = data.ownerId; setOwnerId(data.ownerId); setSessions(data.conversations)
      try { const saved=localStorage.getItem(key('models')); if(saved) setSettings(JSON.parse(saved)) } catch { /* preferences are optional */ }
      setPending(pendingEnvelopes<Envelope>(localStorage,key('pending'))[0] ?? null)
      const id = localStorage.getItem(key('selected'))
      const session = data.conversations.find((c: Conversation) => c.id === id)
      if (session) await select(session)
    }).catch(e => { if (mounted) setError(e.message) })
    return () => { mounted = false; attachmentEpoch.current++; selectedRef.current = null; chatSpeech?.stop() }
  }, [key, select])
  useEffect(() => {
    if (!selected) return
    let timer: ReturnType<typeof setTimeout>; let stopped = false
    const poll = async () => {
      if (document.visibilityState === 'visible') await refresh(selected)
      if (!stopped) timer = setTimeout(poll, snapshotRef.current?.turns.some(t => ['pending','running'].includes(t.state)) ? 1000 : 5000)
    }
    const wake = () => { if (document.visibilityState === 'visible') void refresh(selected) }
    timer = setTimeout(poll, 1000); window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake)
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake) }
  }, [selected, refresh])
  const turns = snapshot ? lineage(snapshot.turns, branch) : []
  const head = turns.at(-1)
  const chosenModels = settings ?? DEFAULT_CONSEJO_MODELS
  const levyModel = chosenModels.synthesis?.model ?? chosenModels.claude.model
  const running = turns.some(t => ['pending','running'].includes(t.state))
  useEffect(() => {
    if (atBottom.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [snapshot])
  async function create() {
    const id = crypto.randomUUID()
    const data = await api({ action: 'create', conversationId: id })
    setSessions(old => [data.conversation, ...old]); await select(data.conversation)
    return data.conversation as Conversation
  }
  async function send(envelope?: Envelope) {
    if (!draft.ready || submissionLock.current || attachmentLock.current) return
    // All entry points (including keyboard) share the same durable-send boundary.
    if (!envelope && (pending || running || (!edit && head && head.state !== 'complete'))) return
    if (envelope && pending && JSON.stringify(envelope) !== JSON.stringify(pending)) return
    const sentDraft=draft.value, sentDraftKey=draftKey
    submissionLock.current = true; setBusy(true); setError('')
    try {
      let request = envelope
      if (!request) {
        if (!text.trim() && !attachments.length) return
        const pastedPath = localImagePath(text)
        if (pastedPath) { if(await attachPath(pastedPath)) setText(''); return }
        const message = text.trim() ? text : 'Texto adjunto.'; const files = attachments
        const c = snapshot?.conversation ?? await create()
        request = { action: 'submit', conversationId: c.id, turnId: crypto.randomUUID(), branchId: edit ? crypto.randomUUID() : branch || c.rootBranchId, parentId: edit ? edit.parentId : head?.id ?? null, message, attachments: files, target:'both', references:structuredClone(references), ...(settings ? {settings:structuredClone(settings)} : {}), ...(edit ? { editTurnId: edit.id } : {}) }
      }
      // Persist the exact envelope BEFORE transport. Retry keeps turn ID and original scope.
      saveEnvelope(localStorage,key('pending'),request); setPending(request)
      const result = await api(request)
      if(!envelope) composerDrafts.clearIfUnchanged(sentDraftKey,EMPTY_DRAFT,sentDraft)
      if (selectedRef.current === request.conversationId) { accept(result); const destination=composerDraftKey(owner.current,'consejo',request.conversationId); composerDrafts.update(destination,EMPTY_DRAFT,old=>({...old,branch:request!.branchId})) }
      acknowledgeEnvelope(localStorage,key('pending'),request.turnId); setPending(pendingEnvelopes<Envelope>(localStorage,key('pending'))[0] ?? null)
      setSessions((await api({ action: 'list' })).conversations)
    } catch (e) { setError((e as Error).message) }
    finally { submissionLock.current = false; setBusy(false) }
  }
  async function action(name: string, t: Turn, provider?: Provider) {
    setBusy(true); setError('')
    try { accept(await api({ action: name, conversationId: selected, turnId: t.id, provider, requestId: crypto.randomUUID() })) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function attach(files: FileList | File[] | Promise<File[]> | null) {
    if (!files) return
    if (attachmentLock.current) return
    const epoch = attachmentEpoch.current
    attachmentLock.current = true; setPreparingImage(true)
    try {
      const items: Attachment[] = []
      for (const f of Array.from(await files)) {
        if (f.size > 4_000_000) throw new Error('Cada adjunto puede tener hasta 4 MB.')
        if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) {
          const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(f) })
          items.push({ name: f.name, type: 'image', content })
        } else if (/\.(txt|md|csv|json)$/i.test(f.name)) items.push({ name: f.name, type: 'text', content: await f.text() })
        else throw new Error('Adjunta imágenes o documentos de texto (.txt, .md, .csv, .json).')
      }
      if (attachments.length + items.length > 5) throw new Error('Hasta cinco adjuntos por turno.')
      const textError = textAttachmentError([...attachments,...items].filter(a => a.type === 'text'))
      if (textError) throw new Error(textError)
      if (JSON.stringify([...attachments,...items]).length > 11_500_000) throw new Error('Los adjuntos superan 11.5 MB de envío; quita alguno antes de enviar.')
      if (epoch === attachmentEpoch.current) { setAttachments(old => [...old, ...items]); setError(''); return true }
    } catch (e) { if(epoch === attachmentEpoch.current) setError(String((e as Error).message ?? e)) }
    finally { attachmentLock.current = false; setPreparingImage(false); if (file.current) file.current.value = '' }
  }
  function attachPath(path:string) { if(attachmentLock.current) return Promise.resolve(false); return attach(readPastedImage(path).then(image=>[image])) }
  function pasteText(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const content = e.clipboardData.getData('text/plain')
    const images = clipboardImages(e.clipboardData)
    const path = localImagePath(content)
    if (attachmentLock.current && (images.length || path || isLongText(content))) { e.preventDefault(); setError('Espera a que termine de preparar el adjunto.'); return }
    if (images.length || path) { e.preventDefault(); if(images.length) void attach(images); else void attachPath(path!); return }
    if (!isLongText(content)) return
    e.preventDefault()
    const next: Attachment[] = [...attachments, { ...pastedTextFile(content, attachments), type: 'text' }]
    const error = next.length > 5 ? 'Hasta cinco adjuntos por turno.' : textAttachmentError(next.filter(a => a.type === 'text'))
    if (error) { setError(error); return }
    setAttachments(next); setError('')
    const el = e.currentTarget
    setText(el.value.slice(0, el.selectionStart) + el.value.slice(el.selectionEnd))
  }
  const createRef = useRef(create)
  createRef.current = create
  useEffect(() => {
    const newChat = () => { void createRef.current().catch(e => setError(e.message)) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') useLayoutStore.getState().closeChatSessionsPanel() }
    window.addEventListener('openclaw:new-chat', newChat)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('openclaw:new-chat', newChat); window.removeEventListener('keydown', escape) }
  }, [])
  const report = (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo completar.')
  return <div className={styles.root}>
    {settingsOpen && <ConsejoSettings value={settings} loadCatalog={() => api({action:'catalog'})} onClose={() => setSettingsOpen(false)} onSave={value => { setSettings(value); localStorage.setItem(key('models'),JSON.stringify(value)); if(selected) localStorage.setItem(key(`models:${selected}`),JSON.stringify(value)); setSettingsOpen(false) }}/>}
    <div className={styles.workspace}>
      {sidebar && <button className={styles.drawerBackdrop} aria-label="Cerrar conversaciones" onClick={closeSidebar}/> }
      <aside className={`${styles.sidebar} ${sidebar ? styles.open : ''}`} aria-label="Conversaciones de Consejo">
        <div className={styles.sidebarHeader}><span>Conversaciones</span><button className="icon-btn" aria-label="Nuevo Consejo" onClick={() => { void create().catch(report) }}><Plus size={14}/></button></div>
        <nav className={styles.spaces} aria-label="Espacios de conversación">
          <ChatAccountTabs options={CHAT_ACCOUNTS} onSelect={account => { if(account !== 'crons') onAccount(account) }}/>
          <ConsejoButton active/>
        </nav>
        <div className={styles.sessionList}>{sessions.map(c => <button className={styles.session} key={c.id} aria-current={selected === c.id ? 'true' : undefined} onClick={() => { void select(c).catch(report) }}><span className={styles.sessionDot} aria-hidden/><span className={styles.sessionText}><span className={styles.sessionTitle}>{c.title}</span>{c.createdAt&&<time dateTime={new Date(c.createdAt).toISOString()}><Clock size={11}/>Creada {formatDistanceToNow(c.createdAt,{locale:es,addSuffix:true})}</time>}</span></button>)}</div>
        {!sessions.length && <p>Tus conversaciones aparecerán aquí.</p>}
      </aside>
      <section className={styles.chat} aria-label="Consejo con Levy">
        <header className={`${styles.header} titanium-header`}>
          <button className={`${styles.historyToggle} icon-btn`} aria-label="Conversaciones de Consejo" aria-expanded={sidebar} onClick={toggleSidebar}><MessageSquare size={18}/></button>
          <button className={styles.identity} aria-label="Configurar modelos de Consejo" onClick={() => setSettingsOpen(true)}><img src="/levy.png" alt=""/><span><strong>Levy</strong><small>Consejo · Claude + OpenAI</small></span></button>
          <button className="icon-btn" aria-label="Nuevo Consejo" onClick={() => { void create().catch(report) }}><Plus size={18}/></button>
        </header>
        <ChatSpeechBar/>
        <div className={styles.feed} ref={feed} onScroll={() => { const el = feed.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }}>
          <div className={styles.reading}>
            {snapshot && new Set(snapshot.turns.map(t => t.branchId)).size > 1 && <label className={styles.branches}>Rama <select aria-label="Rama de conversación" value={branch} onChange={e => { setBranch(e.target.value); setEdit(null); setReferences([]); chatSpeech?.stop() }}>{[...new Set(snapshot.turns.map(t => t.branchId))].map((b, i) => <option key={b} value={b}>{i === 0 ? 'Original' : `Edición ${i}`}</option>)}</select></label>}
            {!turns.length && <div className={styles.empty}><img src="/levy.png" alt=""/><span>CONSEJO · CLAUDE + OPENAI</span><h2>Pensemos juntos.</h2><p>Trae una decisión, una intuición o una pregunta abierta. Puedes retomar cualquier idea de las perspectivas durante la conversación.</p></div>}
            {turns.map((t, i) => <article className={styles.turn} key={t.id} aria-label={`Turno ${i + 1}`}>
              <div className={`${styles.user} msg-bubble-own`}><UserMessageText text={t.message}/>{t.attachments.map((a,j) => a.type === 'text' ? <TextAttachmentCard key={j} file={a}/> : <ImageAttachmentCard key={j} file={a}/>)}<button className={styles.edit} onClick={() => { const draft = presentUserText(t.message); const files = [...t.attachments,...draft.files.map(f => ({...f,type:'text' as const}))]; const preserveOriginal = files.length > 5 || textAttachmentError(files.filter(f => f.type === 'text')); setEdit({id:t.id,parentId:t.parentId}); setText(preserveOriginal ? t.message : draft.text); setAttachments(preserveOriginal ? t.attachments : files); setReferences([]) }}>Editar en nueva rama</button></div>
              <div className={styles.answer}>
                <div className={styles.byline}>Levy <span>{(t.delivery==='claude'||t.delivery==='openai'?t.proposals[t.delivery]:t.proposals.synthesis).identity?.model}</span> {t.delivery === 'execution' ? <span>· Ejecutor único</span> : t.delivery && t.delivery !== 'integrated' && <span>· Sólo {label[t.delivery]}</span>}</div>
                {t.final ? <><div data-tts-content={t.id}><MarkdownMessage content={t.final}/></div><ConsejoMessageActions messageId={t.id} name="Levy" text={t.final} onError={setError} referenced={isReferenced(t.id,'synthesis')} onReference={()=>toggleReference(t.id,'synthesis')}/><ToolActivity proposal={t.delivery==='claude'||t.delivery==='openai'?t.proposals[t.delivery]:t.proposals.synthesis}/></> : <div role="status" className={styles.progress}>{t.contextPreparation?.state === 'running' && <span>Preparando contexto común…</span>}{t.mode==='execution' ? <span>Ejecutor único · {t.execution?.progress?.status || 'En espera'}</span> : (t.target&&t.target!=='both'?[t.target]:['claude','openai','synthesis'] as Stage[]).map(s => <span key={s}>{label[s]} · {status[t.proposals[s].state]}{t.proposals[s].tools?.some(x=>x.state==='running')?' · Consultando…':''}</span>)}</div>}
                {(t.state === 'failed' || t.state === 'cancelled') && <div className={styles.failure}>
                  <p>{t.state === 'cancelled' ? 'Turno cancelado. Las perspectivas terminadas siguen disponibles.' : t.execution?.error || Object.values(t.proposals).find(p => p.error)?.error || 'No se completó la respuesta.'}</p>
                  <button disabled={busy} onClick={() => { void action('retry', t) }}>{t.mode==='execution' ? 'Recuperar ejecución sin repetirla' : 'Reintentar etapas pendientes'}</button>
                  {(['claude','openai'] as Provider[]).filter(p => t.proposals[p].state === 'complete').map(p => <button disabled={busy} key={p} onClick={() => { void action('individual', t, p) }}>Continuar sólo con {label[p]}</button>)}
                </div>}
                {t.state==='running' && t.execution?.progress?.questions.map(q=><QuestionCard key={q.requestId} prompt={q} onAnswer={async(requestId,answers)=>{
                  try { const result=await api({action:'answer',conversationId:selected,turnId:t.id,requestId,answers}); if(selected)await refresh(selected); return !!result.ok }
                  catch(e){setError((e as Error).message);return false}
                }}/>)}
                {t.mode!=='execution' && (!t.target||t.target==='both') && <details className={styles.perspectives}>
                  <summary><span>Ver perspectivas</span><small>Claude + OpenAI</small></summary>
                  <div className={styles.referenceAll}><button type="button" aria-pressed={!!visible[`${t.id}-claude`]&&!!visible[`${t.id}-openai`]} onClick={()=>setVisible(old=>{const open=!(old[`${t.id}-claude`]&&old[`${t.id}-openai`]);return {...old,[`${t.id}-claude`]:open,[`${t.id}-openai`]:open}})}>{visible[`${t.id}-claude`]&&visible[`${t.id}-openai`]?'Ocultar ambas':'Ver ambas'}</button><button type="button" onClick={()=>setReferences(old=>{
                    const available=(['synthesis','claude','openai'] as Stage[]).filter(source=>source==='synthesis'?!!t.final:!!t.proposals[source].text).map(source=>({turnId:t.id,source}))
                    const all=available.every(r=>old.some(x=>x.turnId===r.turnId&&x.source===r.source))
                    return all?old.filter(r=>r.turnId!==t.id):[...old.filter(r=>r.turnId!==t.id),...available].slice(-12)
                  })}>Usar todas en el siguiente mensaje</button></div>
                  {(['claude','openai'] as Provider[]).map(p => <details key={p} className={styles.perspectiveItem} open={!!visible[`${t.id}-${p}`]} onToggle={e=>{const open=e.currentTarget.open;setVisible(old=>old[`${t.id}-${p}`]===open?old:{...old,[`${t.id}-${p}`]:open})}}>
                    <summary>{label[p]} <small>{t.proposals[p].identity?.model ?? status[t.proposals[p].state]}</small></summary>
                    <section aria-label={`Perspectiva de ${label[p]}`}><p className={styles.provenance}>{t.proposals[p].identity?.account}</p>{t.proposals[p].text ? <><div data-tts-content={`${t.id}-${p}`}><MarkdownMessage content={t.proposals[p].text!}/></div><ConsejoMessageActions messageId={`${t.id}-${p}`} name={label[p]} text={t.proposals[p].text!} onError={setError} referenced={isReferenced(t.id,p)} onReference={()=>toggleReference(t.id,p)}/></> : <p>{t.proposals[p].error || 'La perspectiva aparecerá cuando termine.'}</p>}<ToolActivity proposal={t.proposals[p]}/></section>
                  </details>)}
                </details>}
              </div>
            </article>)}
          </div>
        </div>
        <div className={styles.composer}>
          {draft.error && <p role="alert" className={styles.error}>{draft.error}</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {preparingImage && <p role="status" className="text-xs text-muted">Preparando imagen…</p>}
          {pending && <div className={styles.pending}><p>Envío conservado · {pending.message.slice(0,90)}</p><button disabled={busy} onClick={() => { void send(pending) }}>Recuperar o reenviar el mismo envío</button></div>}
          {edit && <div className={styles.editBanner}>Editando en una rama nueva <button onClick={() => { setEdit(null); setText(''); setAttachments([]) }}>Cancelar edición</button></div>}

          {references.length>0&&<div className={styles.referenceTray} aria-label="Respuestas elegidas como contexto">{references.map(r=><button key={`${r.turnId}-${r.source}`} type="button" onClick={()=>toggleReference(r.turnId,r.source)} aria-label={`Quitar referencia ${label[r.source]} del turno ${turns.findIndex(t=>t.id===r.turnId)+1}`}>{r.source==='synthesis'?'Levy':label[r.source]} · {turns.findIndex(t=>t.id===r.turnId)+1} ×</button>)}</div>}
          <form className={`msg-composer ${composerUI.frame}`} onSubmit={e => { e.preventDefault(); if ((e.nativeEvent as SubmitEvent).submitter?.hasAttribute('data-consejo-send')) void send() }}>
          {attachments.length > 0 && <div className={composerUI.attachments} aria-label="Archivos adjuntos">{attachments.map((a,i) => a.type === 'text' ? <TextAttachmentCard key={`${i}-${a.name}`} file={a} onRemove={() => setAttachments(old => old.filter((_,j) => i !== j))} onChange={content => setAttachments(old => old.map((f,j) => i === j ? {...f,content} : f))}/> : <ImageAttachmentCard compact key={i} file={a} onRemove={() => setAttachments(old => old.filter((_,j) => i !== j))}/>)}</div>}
            <label className={styles.srOnly} htmlFor="consejo-message">Mensaje para Consejo</label>
            <textarea ref={textarea} data-scroll-region className={`chat-input-scroll ${composerUI.inputRegion}`} id="consejo-message" readOnly={!draft.ready} value={text} onChange={e => setText(e.target.value)} onPaste={pasteText} placeholder={attachments.some(a => a.type === 'text') ? '¿Qué hacemos con el texto?' : 'Mensaje...'} rows={2} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }}/>
            <div className={`${styles.composerActions} ${composerUI.toolbar}`}>
              <input ref={file} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json" onChange={e => { void attach(e.target.files) }}/>
              <button type="button" aria-label="Adjuntar archivo" onClick={() => file.current?.click()}><Paperclip size={18}/></button>
              <VoiceInput onVoiceNote={transcript => setText(old => old ? `${old}\n${transcript}` : transcript)} disabled={busy}/>
              <button type="button" className={composerUI.model} aria-label="Modelos y esfuerzo de Consejo" title="Modelos y esfuerzo" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={18}/><span className="text-xs">Levy · {exactModelLabel(levyModel)}</span></button>
              {running ? <button className="msg-stop-btn" type="button" aria-label="Cancelar turno" disabled={busy} onClick={() => { const active = turns.find(t => ['pending','running'].includes(t.state)); if (active) void action('cancel', active) }}><Square size={14} fill="currentColor"/></button> : <button className={`${styles.send} msg-send-btn`} data-consejo-send type="submit" aria-label="Enviar a Consejo" disabled={!draft.ready || busy || preparingImage || !!pending || (!text.trim() && !attachments.length) || (!edit && !!head && head.state !== 'complete')}><ArrowUp size={20}/></button>}
            </div>
          </form>
          <p className={styles.composerHint}>⌘ Enter enviar · Shift+Enter nueva línea</p>
        </div>
      </section>
    </div>
  </div>
}

function ToolActivity({proposal}:{proposal:Proposal}) {
  const [error,setError]=useState('')
  if(!proposal.tools?.length)return null
  return <details className={styles.toolActivity}><summary>Fuentes y consultas · {proposal.tools.length}</summary>{proposal.tools.map(t=><div key={t.id}>
    <p>{t.name==='consult_provider'?`Aclaración · ${String(t.input.provider)}`:String(t.input.path??t.input.query??t.input.action??t.name)} · {status[t.state]}{t.cached?' · reutilizada':''}</p>
    {t.name==='consult_provider'&&<><p>{String(t.input.question??'')}</p><small>{t.identity?.model} · {t.identity?.account}</small>{t.text&&<><div data-tts-content={t.id}><MarkdownMessage content={t.text}/></div><ConsejoMessageActions messageId={t.id} name={`Aclaración de ${t.identity?.model??String(t.input.provider)}`} text={t.text} onError={setError}/></>}</>}
    {t.error&&<p>{t.error}</p>}
  </div>)}{error&&<p role="alert">{error}</p>}</details>
}
