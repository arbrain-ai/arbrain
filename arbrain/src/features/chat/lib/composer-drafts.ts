import {ErrorBorrador,crearPersistenciaBorradores,type Almacen,type Escritura,type Lectura} from './draft-persistence.ts'
import {MARCA_IMAGEN,claveEquivalente,docVacio,fundirBorrador,type BorradorTraspaso} from '../../../lib/mudanza-servidor.ts'
type Entry<T> = { value:T; ready:boolean; error:string; revision:number }
// `get` devuelve el valor y, si algo del borrador no se pudo recuperar, el aviso; `set` puede responder
// con un aviso cuando guardó el texto pero no alguna imagen. Lanzar significa que el documento no se guardó.
type Persistence = { get(key:string):Promise<Lectura>; set(key:string,value:unknown):Promise<Escritura> }

/** Drafts are local and inert. Only the explicit send path creates an envelope. */
export class ComposerDrafts {
  private entries = new Map<string,Entry<unknown>>()
  private empties = new Map<string,unknown>()
  private listeners = new Set<()=>void>()
  private loads = new Map<string,Promise<void>>()
  private writes = new Map<string,Promise<void>>()
  private persistence:Persistence
  constructor(persistence:Persistence) { this.persistence=persistence }
  subscribe = (listener:()=>void) => { this.listeners.add(listener); return ()=>{this.listeners.delete(listener)} }
  private emit() { this.listeners.forEach(listener=>listener()) }
  entry<T>(key:string,empty:T):Entry<T> {
    if(!this.entries.has(key)) this.entries.set(key,{value:empty,ready:false,error:'',revision:0})
    if(!this.empties.has(key)) this.empties.set(key,empty)
    return this.entries.get(key) as Entry<T>
  }
  async load<T>(key:string,empty:T):Promise<void> {
    if(this.entry(key,empty).ready) return
    const existing=this.loads.get(key); if(existing) return existing
    const revision=this.entry(key,empty).revision
    const loading=(async()=>{
      try {
        const {value:saved,aviso}=await this.persistence.get(key)
        const current=this.entry(key,empty)
        if(current.revision===revision) this.entries.set(key,{...current,value:saved && typeof saved==='object'?{...empty,...saved}:empty,ready:true,error:aviso??''})
      } catch {
        const current=this.entry(key,empty)
        this.entries.set(key,{...current,ready:true,error:'No se pudo recuperar el borrador guardado en este dispositivo.'})
      } finally { this.loads.delete(key); this.emit() }
    })()
    this.loads.set(key,loading); return loading
  }
  update<T>(key:string,empty:T,updater:(value:T)=>T) {
    const old=this.entry(key,empty),value=updater(old.value),revision=old.revision+1
    this.entries.set(key,{value,revision,ready:true,error:''}); this.emit()
    // Writes stay ordered, including a clear immediately followed by new typing.
    const write=(this.writes.get(key)??Promise.resolve()).then(()=>this.persistence.set(key,value)).then(res=>{
      const current=this.entry(key,empty),error=res?res.aviso:''
      if(current.revision===revision && current.error!==error) {this.entries.set(key,{...current,error});this.emit()}
    }).catch(e=>{
      const current=this.entry(key,empty)
      if(current.revision===revision) {this.entries.set(key,{...current,error:e instanceof ErrorBorrador?e.mensaje:'Tu borrador sigue abierto, pero no pudo guardarse en este dispositivo. No cierres la app todavía.'});this.emit()}
    })
    this.writes.set(key,write)
  }
  clearIfUnchanged<T>(key:string,empty:T,sent:T) {
    if(this.entry(key,empty).value===sent) this.update(key,empty,()=>empty)
  }
  async idle(key:string) {await this.writes.get(key)}
  /** Todas las escrituras de borradores en vuelo (antes de recargar la app para actualizarla). */
  async idleAll() {await Promise.allSettled([...this.writes.values()])}
  /** Vuelve a leer los borradores que nadie tocó desde que se cargaron (llegó un traspaso de otro servidor). */
  recargarIntactos() {
    for(const [key,e] of this.entries) if(e.ready && e.revision===0 && !this.loads.has(key)) {
      this.entries.set(key,{...e,ready:false})
      void this.load(key,this.empties.get(key))
    }
  }
}

export function composerDraftKey(owner:string,space:string,conversation?:string|null) {
  return `arbrain:composer:v1:${JSON.stringify([owner,space,conversation??'new'])}`
}

/**
 * Borradores que llegaron de otro servidor (mudanza 3218 → 3300, 11 oct 2026) y aún no tienen dueño en este origen.
 * Se materializan al leer la clave equivalente (mismo espacio y conversación; el dueño puede cambiar de origen).
 */
const traspasoPendiente = new Map<string,BorradorTraspaso>()

function bytesDe(b64:string):ArrayBuffer {
  const bin=atob(b64), out=new Uint8Array(bin.length)
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i)
  return out.buffer
}

/** Si hay un borrador traído para `key`, lo escribe aquí (fundido con lo que hubiera) antes de leerlo. */
export async function adoptarTraspaso(key:string,almacen:Almacen) {
  if(!traspasoPendiente.size) return
  const origen=claveEquivalente(key,traspasoPendiente.keys()); if(!origen) return
  const t=traspasoPendiente.get(origen)!; traspasoPendiente.delete(origen)
  for(const img of t.imagenes) {
    try { await almacen.set(key+MARCA_IMAGEN+img.id,{name:img.name,type:img.type,lastModified:img.lastModified,bytes:bytesDe(img.b64)}) } catch { /* el texto pasa igual; la lectura avisa la imagen que falte */ }
  }
  const actual=await almacen.get(key)
  await almacen.set(key,docVacio(actual)?t.doc:fundirBorrador(actual,t.doc))
}

const almacenIdb:Almacen = {
  get:async key=>(await import('idb-keyval')).get(key),
  set:async (key,value)=>(await import('idb-keyval')).set(key,value),
  del:async key=>(await import('idb-keyval')).del(key),
}
const persistenciaIdb=crearPersistenciaBorradores(almacenIdb)

export const composerDrafts = new ComposerDrafts({
  get:async key=>{ try { await adoptarTraspaso(key,almacenIdb) } catch { /* sin traspaso: el borrador propio manda */ } return persistenciaIdb.get(key) },
  set:persistenciaIdb.set,
})

/** Recibe los borradores de otro servidor: los que coinciden con un composer abierto aparecen ya; el resto, al abrirlo. */
export function recibirBorradoresTraspasados(borradores:BorradorTraspaso[]) {
  for(const b of borradores) if(!docVacio(b.doc)) traspasoPendiente.set(b.clave,b)
  if(traspasoPendiente.size) composerDrafts.recargarIntactos()
}
