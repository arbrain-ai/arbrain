'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import { ArrowUpRight, RefreshCw, Search, Inbox } from 'lucide-react'
import { useReading } from './useReading'
import { numeric, stamp, type Video, type Videos } from './types'
import { civilToday, shiftDay } from '@/features/sistema/calendar-days'
import { canonicalSection } from '@/features/todotask/model'
import { usePlanning } from '@/features/planning/usePlanning'
import s from './clarity.module.css'
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { VistaContenido } from '@/features/cabina/vistas/Contenido'
import { VideoFunnel } from './VideoFunnel'
import { SalesCoverage } from './Sales'
import { saleMoney, type SalesReading, type CurrencySales } from './sales-types'
const InboxView=dynamic(()=>import('@/features/youtube/BandejaView').then(m=>m.BandejaView))
type Pestana='production'|'radar'|'results'|'inbox'
const PESTANAS:[Pestana,string][]=[['production','Producción'],['radar','Radar'],['results','Resultados']]
const pestanaDe=(raw:string):Pestana=>['radar','intel'].includes(raw)?'radar':['results','contenido'].includes(raw)?'results':['bandeja','comments','leads'].includes(raw)?'inbox':'production'

/** Contenido completo (4 oct 2026, «el panel es la experiencia completa»): la sección /youtube y la pestaña del panel
 *  son esta misma pieza. En la sección cada pestaña es su URL; en el panel se cambia sin salir del chat. */
export function ContentWorkspace({donde='seccion'}:{donde?:'seccion'|'panel'}={}){
 const params=useSearchParams(), [local,setLocal]=useState<Pestana>('production')
 const enPanel=donde==='panel', tab=enPanel?local:pestanaDe(params.get('tab')??'production')
 const ir=(id:Pestana,href:string,label:React.ReactNode,extra?:React.ReactNode)=>enPanel
  ?<button key={id} role="tab" aria-selected={tab===id} onClick={()=>setLocal(id)}>{extra}{label}</button>
  :<Link key={id} role="tab" aria-selected={tab===id} href={href}>{extra}{label}</Link>
 return <main className={s.root} data-donde={donde}><header className={s.bar}><nav role="tablist" aria-label="Contenido">{PESTANAS.map(([id,label])=>ir(id,`/youtube?tab=${id}`,label))}</nav><span className={s.spacer}/>{ir('inbox','/youtube?tab=bandeja',<span>Comentarios</span>,<Inbox size={15} aria-hidden/>)}</header>{tab==='inbox'?<InboxView/>:tab==='production'?<Production enPanel={enPanel} alRadar={enPanel?()=>setLocal('radar'):undefined}/>:<VideoList key={tab} radar={tab==='radar'} enPanel={enPanel}/>}</main>
}
function Production({enPanel,alRadar}:{enPanel?:boolean;alRadar?:()=>void}){
 const published=useReading<Videos>('/api/clarity?section=results')
 const today=civilToday('America/Mexico_City'),start=shiftDay(today,-((new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7))
 const thisWeek=published.data?.videos.filter(v=>{const day=civilToday('America/Mexico_City',new Date(v.published_at));return day>=start&&day<=today}).length
 const range=useMemo(()=>({from:new Date().toISOString(),to:new Date(Date.now()+86400000).toISOString()}),[])
 const {snapshot,error,loading}=usePlanning(range)
 const projects=snapshot?.projects.filter(p=>/youtube/i.test(p.title)).map(p=>p.id)??[]
 const tasks=snapshot?.tasks.filter(t=>!t.completed&&t.projectId&&projects.includes(t.projectId))??[]
 const active=tasks.filter(t=>snapshot?.sections?.some(section=>section.id===t.sectionId&&canonicalSection(section.title)==='haciendo'))
 const [showBacklog,setShowBacklog]=useState(false)
 const shown=showBacklog?tasks:active
 return <div className={s.body} data-production-ready={!loading}><div className={s.inner}>{!enPanel&&<SeccionCabecera ceja={<>Contenido · <b>YouTube</b></>} titulo="Trabajo de YouTube" descripcion="Lo que publicaste este mes contra la meta y lo que está en producción. Las tareas se gestionan en Objetivos." acciones={<Link className="pg-boton" href="/todotask?view=list">Ver tareas <ArrowUpRight size={14}/></Link>}/>}<div className={`pg-bloque ${s.cifrasV2}`}><VistaContenido grande sinCeja /></div>{error&&<p className={s.notice} role="alert">{error}</p>}{thisWeek!=null&&<p className={s.muted}>Esta semana · {published.data?.limited?'Al menos ':''}{thisWeek} publicaciones registradas · {snapshot?active.length:'…'} en curso. Semana desde {start}, hora de México.</p>}{published.error&&<p className={s.notice}>No se pudo actualizar la lectura de publicaciones.</p>}<section className={s.section}><h2>{showBacklog?'Ideas y pendientes':'En curso'}</h2>{!shown.length?<div className={s.empty}>{loading?'Consultando Todoist…':'No hay tareas de YouTube en curso. Tus ideas guardadas están abajo.'}<br/>{alRadar?<button className={s.link} onClick={alRadar}>Explorar referencias <ArrowUpRight size={14}/></button>:<Link className={s.link} href="/youtube?tab=radar">Explorar referencias <ArrowUpRight size={14}/></Link>}</div>:shown.map(t=><div key={t.id} className={s.row}><span className={s.grow}><strong>{t.title}</strong>{t.description&&<details><summary className={s.muted}>Contexto y materiales</summary><div className={s.muted}><ReactMarkdown>{t.description}</ReactMarkdown></div></details>}<small>{t.due?`Fecha registrada: ${stamp(t.due)}`:'Sin fecha · no implica producción activa'}</small></span>{t.url?<a className={s.link} href={t.url} target="_blank" rel="noreferrer">Todoist <ArrowUpRight size={13}/></a>:<Link className={s.link} href="/todotask?view=list">Abrir lista ↗</Link>}</div>)}</section>{tasks.length>0&&<button className={s.link} onClick={()=>setShowBacklog(!showBacklog)}>{showBacklog?'Mostrar solo en curso':`Ver ideas y pendientes guardados (${tasks.length})`}</button>}<p className={s.muted}>Las tareas se gestionan en Objetivos; aquí puedes consultar su contexto y materiales.</p><Link className={s.link} href={`/chat?draft=${encodeURIComponent('Revisemos mi contenido registrado y sus materiales. Ayúdame a elegir el siguiente paso, sin crear tareas ni eventos todavía.')}`}>Continuar la conversación <ArrowUpRight size={14}/></Link></div></div>
}
function VideoList({radar,enPanel}:{radar:boolean;enPanel?:boolean}){
 const {data,error,loading,refresh}=useReading<Videos>(`/api/clarity?section=${radar?'radar':'results'}`)
 const [query,setQuery]=useState('')
 const [salesDays,setSalesDays]=useState(30)
 const sales=useReading<SalesReading>(radar?null:`/api/clarity/sales?days=${salesDays}`,true,120000)
 const [sort,setSort]=useState('recent'),[selected,setSelected]=useState<Video|null>(null)
 const videos=data?.videos.filter(v=>`${v.title} ${v.channel_name??''}`.toLowerCase().includes(query.toLowerCase()))??[]
 if(sort==='views')videos.sort((a,b)=>(b.views??-1)-(a.views??-1))
 return <div className={s.body}><div className={s.inner}><SeccionCabecera as={enPanel?'h2':'h1'} ceja={<>Contenido · <b>{radar?'Radar':'Resultados'}</b></>} titulo={enPanel?undefined:radar?'Fuera de tu burbuja.':'Lo que ya publicaste.'} descripcion={radar?'Referencias recientes, no una lista de pendientes. Captura de YouTube; análisis editorial bajo demanda.':'Publicaciones recientes primero. Vistas acumuladas y retención por video; las ventas atribuidas van aparte.'} acciones={<button className="pg-boton" onClick={refresh} disabled={loading} aria-label="Actualizar videos"><RefreshCw size={14}/>{loading?'Actualizando…':'Actualizar'}</button>}/><div className={s.filters} style={{marginTop:20}}><Search size={16}/><input aria-label="Buscar videos" placeholder={radar?'Buscar tema o canal…':'Buscar una publicación…'} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Ordenar videos" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Más recientes</option><option value="views">Más vistos</option></select></div>{error&&<p role="alert" className={s.notice}>{error} {data?'Se conserva la última lectura.':''}</p>}{!radar&&<><div className={s.filters}><label className={s.muted}>Ventas · <select aria-label="Período de ventas" value={salesDays} onChange={e=>setSalesDays(Number(e.target.value))}><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option><option value={0}>Histórico</option></select></label><button className={s.link} onClick={sales.refresh} disabled={sales.loading}>{sales.loading?'Reconciliando…':'Actualizar ventas'}</button></div>{sales.error&&<p className={s.notice} role="alert">{sales.error}</p>}{sales.data&&<SalesCoverage data={sales.data}/>}</>}{!data&&!error&&<p className={s.empty}>Consultando videos…</p>}{data&&!videos.length&&<p className={s.empty}>{query?'No hay coincidencias.':'No hay publicaciones en esta lectura.'}</p>}{videos.map(v=><article key={v.video_id} className={`${s.row} ${s.videoRow}`}><a className={s.videoMain} href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.video_id)}`} target="_blank" rel="noreferrer"><span className={s.thumbWrap}><VideoThumbnail video={v}/>{radar&&v.duration_seconds!=null&&v.duration_seconds>0&&<span className={s.duration}>{Math.floor(v.duration_seconds/60)}:{String(v.duration_seconds%60).padStart(2,'0')}</span>}</span><span className={s.grow}><strong>{v.title}</strong><small>{v.channel_name&&`${v.channel_name} · `}Publicado {stamp(v.published_at)}</small><small>Registro actualizado {stamp(v.updated_at)}</small></span></a><div className={s.videoNumbers}><span className={s.value}>{numeric(v.views)}<small>vistas acumuladas</small></span>{!radar&&<><span className={s.value} title={`Analíticas: ${stamp(v.analytics_synced_at)}`}>{v.avg_view_percentage==null?'Sin dato':`${v.avg_view_percentage.toFixed(0)}%`}<small>retención · última lectura</small></span><VideoSales groups={sales.data?.byVideo[v.video_id]} known={!!sales.data}/><button className={s.link} onClick={()=>setSelected(v)}>{v.link_slug?'Ver embudo':'Revisar tracking'} <ArrowUpRight size={13}/></button></>}</div></article>)}{selected&&<VideoFunnel video={selected} initialDays={salesDays} close={()=>setSelected(null)}/>}{data&&<p className={s.muted} style={{marginTop:18}}>{data.limited?'Mostrando las 100 publicaciones más recientes.':'Fin de esta lectura.'} Consultado {stamp(data.loadedAt)} · Cada video conserva su propia fecha de actualización.</p>}</div></div>
}

function VideoThumbnail({video}:{video:Video}){
 const fallback=`https://i.ytimg.com/vi/${encodeURIComponent(video.video_id)}/hqdefault.jpg`
 const [src,setSrc]=useState(video.thumbnail_url||fallback),[failed,setFailed]=useState(false)
 return failed?<span className={s.missingThumb}>Miniatura no disponible</span>:<img className={s.videoThumb} src={src} alt={`Miniatura de ${video.title}`} loading="lazy" decoding="async" onError={()=>src!==fallback?setSrc(fallback):setFailed(true)}/>
}

function VideoSales({groups,known}:{groups?:CurrencySales;known:boolean}){
 if(!known)return <span className={s.salesColumn}>—<small>ventas sin lectura</small></span>
 const entries=Object.entries(groups??{}),count=entries.reduce((n,[,g])=>n+(g.kinds.new?.count??0),0),renewals=entries.reduce((n,[,g])=>n+(g.kinds.renewal?.count??0),0)
 return <span className={s.salesColumn}>{count} altas atribuidas{entries.map(([currency,g])=>g.kinds.new?<small key={currency}>{saleMoney(g.kinds.new.paidCents,currency)} cobrados</small>:null)}{renewals>0&&<small>{renewals} renovaciones aparte</small>}</span>
}
