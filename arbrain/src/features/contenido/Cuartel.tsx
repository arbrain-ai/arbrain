'use client'
/**
 * El cuartel de Contenido (15 nov 2026). El dueño: «uno donde tengo control del algoritmo de recomendación de videos y
 * no de lo que YouTube le da a mi sistema límbico». Cuatro pestañas sobre una sola lectura del Studio
 * (`/api/contenido`): Aprender, Radar, Ideas y Tu canal. La sala (reproductor) y la ficha de canal son una sola para todas.
 * Sin Shorts, sin comentarios ajenos, sin «te puede interesar», sin scroll infinito.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useReading } from '@/features/clarity/useReading'
import { Aprender } from './Aprender'
import { Radar } from './Radar'
import { Ideas } from './Ideas'
import { TuCanal } from './TuCanal'
import { Sala, type EnSala } from './Sala'
import { FichaDeCanal } from './FichaCanal'
import { Competidores } from './Competidores'
import { CuartelCtx } from './piezas'
import { AvisoPie, HojaDespues, VerDespuesCtx } from './VerDespues'
import { DescargasVista, Guardados, VerDespuesVista, videoDe } from './MisVideos'
import { useMios } from './useMios'
import type { FichaVideo } from './mios'
import type { SeccionContenido } from './Riel'
import { compacto, edad } from './modelo'
import { BarraFiltro } from './BarraFiltro'
import { guardable, resolver, sumar, vocabularioDe, type Ficha } from './filtro'
import { temasChip } from './pantalla'
import type { LecturaCuartel } from './tipos'
import s from './cuartel.module.css'

export type PestanaCuartel = Exclude<SeccionContenido, 'inbox'>

const LLAVE_FILTRO = 'contenido:filtro'

/** El filtro único (19 nov 2026): vive aquí para que viaje entre Inicio y Radar, y en la sesión para que sobreviva a recargar. */
function useFiltro() {
  const [fichas, setFichas] = useState<Ficha[]>([])
  useEffect(() => { try { setFichas(guardable(JSON.parse(sessionStorage.getItem(LLAVE_FILTRO) ?? '[]'))) } catch { /* sin almacenamiento */ } }, [])
  const cambiar = useCallback((f: Ficha[]) => { setFichas(f); try { sessionStorage.setItem(LLAVE_FILTRO, JSON.stringify(f)) } catch { /* */ } }, [])
  const [previa, setPrevia] = useState<Ficha[]>([])
  return { fichas, cambiar, previa, setPrevia }
}

export function Cuartel({ pestana, enPanel, ver, irPestana, irComentarios, produccion, videosYVentas }: {
  pestana: PestanaCuartel; enPanel?: boolean; ver?: string | null; irPestana?: (p: PestanaCuartel) => void; irComentarios?: () => void; produccion: React.ReactNode; videosYVentas: React.ReactNode
}) {
  const { data, error, loading, refresh } = useReading<LecturaCuartel>('/api/contenido', false, 45000)
  const [sala, setSala] = useState<EnSala | null>(null)
  const cerrar = useCallback(() => setSala(null), [])
  // «Ir al canal» (v2): la ficha del canal se abre aquí dentro, encima de lo que haya (incluso de la sala).
  const [canal, setCanal] = useState<string | null>(null)
  const cerrarCanal = useCallback(() => setCanal(null), [])
  const avatares = useMemo(() => new Map((data?.universo?.canales ?? []).filter(c => c.miniatura_url).map(c => [c.channel_id, c.miniatura_url as string])), [data?.universo])
  const ctx = useMemo(() => ({ irCanal: (id: string) => setCanal(id), avatar: (id: string) => avatares.get(id) ?? null }), [avatares])
  const abrirDesdeCanal = useCallback((e: EnSala) => { setCanal(null); setSala(e) }, [])
  useEffect(() => { const t = setInterval(refresh, 5 * 60 * 1000); return () => clearInterval(t) }, [refresh])
  // «Ver después» (17 nov 2026): una sola hoja para todas las tarjetas y la Sala.
  const [hoja, setHoja] = useState<FichaVideo | null>(null)
  const cerrarHoja = useCallback(() => setHoja(null), [])
  // `?ver=<id>`: el bloque del calendario trae de vuelta a ESTE video, en la Sala. Se abre una vez por id.
  const { mios, cargado } = useMios()
  const abiertoPorEnlace = useRef<string | null>(null)
  useEffect(() => {
    if (!ver || !data || abiertoPorEnlace.current === ver || !/^[\w-]{11}$/.test(ver)) return
    const porId = new Map([...data.videos, ...data.outliers, ...(data.dosis?.videos ?? []).map(p => p.video).filter((v): v is NonNullable<typeof v> => !!v)].map(v => [v.video_id, v]))
    const propio = mios.despues.find(d => d.video_id === ver) ?? mios.guardados.find(g => g.video_id === ver)
    if (!porId.has(ver) && !propio && !cargado) return
    abiertoPorEnlace.current = ver
    setSala({ video: videoDe(propio ?? { video_id: ver, titulo: ver, canal: '' }, porId), desde: 'biblioteca' })
  }, [ver, data, mios, cargado])
  const filtro = useFiltro()
  const voc = useMemo(() => vocabularioDe(temasChip(data?.universo?.temas), data?.universo?.canales ?? []), [data?.universo])
  // Lo que se ve: las fichas puestas más lo que está escribiendo (vista previa en vivo).
  const vistas = useMemo(() => sumar(filtro.fichas, filtro.previa), [filtro.fichas, filtro.previa])
  const criterio = useMemo(() => resolver(vistas, voc), [vistas, voc])
  const conFiltro = pestana === 'aprender' || pestana === 'radar'
  const generado = data?.estado?.generado ?? data?.estado?.ultima_corrida?.fin ?? null

  const avisos = data?.avisos.filter(a => !a.startsWith('Dosis provisional')) ?? []
  const viejo = !!generado && Date.now() - Date.parse(generado) > 6 * 36e5
  const alerta = !data || data.fuente !== 'sensor' || avisos.length > 0 || viejo || !!error
  const est = data?.estado
  const detalleSensor = est ? [est.ultima_corrida ? `Última corrida completa ${edad(est.ultima_corrida.fin ?? est.ultima_corrida.inicio)} (${est.ultima_corrida.estado})` : null,
    est.cuota ? `cuota de hoy ${compacto(est.cuota.usadas)} de ${compacto(est.cuota.tope_sensor)}` : null,
    est.totales ? `${est.totales.canales ?? '—'} canales · ${compacto(est.totales.largos ?? est.totales.videos)} videos · ${compacto(est.totales.transcripts)} transcripts` : null].filter(Boolean).join(' · ') : undefined
  const lineaEstado = <>
    <span data-fuente={data?.fuente} data-viejo={viejo || undefined} title={detalleSensor}>{data ? (data.fuente === 'sensor' ? <>Sensor · {generado ? `al día ${edad(generado)}` : 'sin fecha'}</> : data.fuente === 'radar' ? 'Radar de antes · el sensor aún no publica' : 'Sin lectura') : loading ? 'Leyendo tu cuartel…' : ''}</span>
    {avisos.map(a => <span key={a} className={s.avisoLinea}>{a}</span>)}
    <button className={s.icono} onClick={refresh} disabled={loading} aria-label="Releer el cuartel" title="Releer"><RefreshCw size={13} className={loading ? s.gira : undefined} /></button>
  </>
  return <CuartelCtx.Provider value={ctx}><VerDespuesCtx.Provider value={setHoja}><div className={s.cuartel} data-panel={enPanel || undefined} data-testid="cuartel" data-pestana={pestana} data-listo={!!data || undefined}>
    <div className={s.cuartelInterior}>
      {/* Arriba solo se dice el sensor si algo falla o hay aviso; cuando va bien, su línea vive al pie. */}
      {alerta && <div className={s.estadoLinea} data-testid="estado-alerta">{lineaEstado}</div>}
      {error && !data && <p className={s.avisoChico} role="alert">{error}</p>}
      {data && conFiltro && <BarraFiltro fichas={filtro.fichas} cambiar={filtro.cambiar} previa={filtro.setPrevia} voc={voc} criterio={criterio} />}
      {!data ? <Esqueleto /> : pestana === 'aprender' ? <Aprender lectura={data} abrir={setSala} releer={refresh} irCola={irPestana ? () => irPestana('despues') : undefined} criterio={criterio} />
        : pestana === 'radar' ? <Radar lectura={data} abrir={setSala} criterio={criterio} />
        : pestana === 'competidores' ? <Competidores lectura={data} />
        : pestana === 'ideas' ? <Ideas lectura={data} abrir={setSala} releer={refresh} produccion={produccion} />
        : pestana === 'guardados' ? <Guardados lectura={data} abrir={setSala} />
        : pestana === 'despues' ? <VerDespuesVista lectura={data} abrir={setSala} />
        : pestana === 'descargas' ? <DescargasVista lectura={data} abrir={setSala} />
        : <TuCanal lectura={data} videosYVentas={videosYVentas} enPanel={enPanel} irComentarios={irComentarios} abrir={setSala} />}
      {data && !alerta && <div className={`${s.estadoLinea} ${s.estadoPie}`} data-testid="estado-pie">{lineaEstado}</div>}
    </div>
    {sala && <Sala key={sala.video.video_id} en={{ ...sala, final: sala.final, alTerminar: sala.alTerminar }} cerrar={cerrar} />}
    {canal && data && <FichaDeCanal id={canal} lectura={data} abrir={abrirDesdeCanal} cerrar={cerrarCanal} />}
    {hoja && <HojaDespues key={hoja.video_id} video={hoja} cerrar={cerrarHoja} />}
    <AvisoPie />
  </div></VerDespuesCtx.Provider></CuartelCtx.Provider>
}

function Esqueleto() {
  return <div className={s.esqueleto} aria-label="Leyendo tu cuartel"><span /><span /><span /><span /></div>
}
