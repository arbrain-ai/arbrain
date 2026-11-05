/**
 * Réplica local de una comunidad de Skool (4 nov 2026), para probar el flujo «borrador de post» sin tocar Skool real.
 * Copia los patrones que frenaron a las manos ese día:
 *   - El cuadro «Escribe algo» es un div sin rol ni tabindex: el árbol de accesibilidad solo lo ve como texto.
 *   - El clic llega por delegación en la raíz, como React: ni `onclick` ni `tabindex` lo delatan; solo `cursor: pointer`.
 *   - El selector de categoría y sus opciones son divs sin rol; «Feedback» va justo debajo de «Wins».
 *   - Debajo del compositor está el feed: un clic que cae de más abre otro post (pasó con el desfase de la captura).
 *   - «Ver más publicaciones» no tiene ni `cursor: pointer`: solo el texto visible lo encuentra.
 * Cuenta lo que recibe: `publicados` (POST /publicar) tiene que quedar en 0 y `postsAbiertos` dice si un clic cayó mal.
 */
import { createServer, type Server } from 'node:http'

export const CATEGORIAS_REPLICA = ['General', 'Wins', 'Feedback', 'Preguntas', 'Recursos']

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Skool Accelerator (réplica)</title><style>
  body { margin: 0; font: 15px/1.4 -apple-system, sans-serif; background: #f8f7f5; color: #202124 }
  header { height: 60px; background: #fff; border-bottom: 1px solid #e4e4e4; display: flex; align-items: center; padding: 0 200px; font-weight: 700 }
  .c { cursor: pointer }
  #compositor { position: absolute; left: 200px; top: 84px; width: 500px; height: 64px; background: #fff; border: 1px solid #e4e4e4; border-radius: 10px; display: flex; align-items: center; gap: 12px; padding: 0 16px; box-sizing: border-box }
  #compositor .av { width: 36px; height: 36px; border-radius: 50%; background: #c9b8f0 }
  #compositor .ph { color: #8a8a8a }
  #feed { position: absolute; left: 200px; top: 170px; width: 880px }
  .post { height: 150px; background: #fff; border: 1px solid #e4e4e4; border-radius: 10px; margin-bottom: 14px; padding: 16px; box-sizing: border-box }
  .post .t { font-weight: 700 }
  #vermas { color: #5b5b5b; padding: 8px 0 400px }
  #modal { position: fixed; inset: 0; background: #0006; display: none }
  #modal.abierto { display: block }
  #panel { position: absolute; left: 290px; top: 70px; width: 700px; background: #fff; border-radius: 12px; padding: 20px; box-sizing: border-box }
  #titulo { width: 100%; font-size: 20px; border: 0; outline: 0; padding: 6px 0; font-weight: 700 }
  #cuerpo { min-height: 160px; outline: 0; padding: 6px 0; white-space: pre-wrap }
  #cuerpo:empty::before { content: attr(data-placeholder); color: #9a9a9a }
  #pie { display: flex; align-items: center; gap: 12px; margin-top: 12px; position: relative }
  #categoria { border: 1px solid #ccc; border-radius: 8px; padding: 6px 10px; min-width: 190px }
  #opciones { position: absolute; left: 0; bottom: 40px; width: 210px; background: #fff; border: 1px solid #ccc; border-radius: 8px; display: none }
  #opciones.abierto { display: block }
  .op { padding: 8px 12px; height: 18px }
  .op:hover { background: #f0ecfa }
  #pie .esp { flex: 1 }
  button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #ccc; background: #fff }
  #publicar { background: #f5d64e; border-color: #f5d64e; font-weight: 700 }
</style></head><body>
<header>Skool Accelerator</header>
<div id="compositor" class="c" data-c="abrir"><div class="av"></div><div class="ph">Escribe algo</div></div>
<div id="feed">
  ${[1, 2, 3, 4].map(i => `<div class="post c" data-c="post" data-n="${i}"><div class="t">Pregunta de la semana #${i}</div><div>Un miembro cuenta algo interesante número ${i}.</div></div>`).join('')}
  <div id="vermas" data-c="vermas">Ver más publicaciones</div>
</div>
<div id="modal"><div id="panel">
  <input id="titulo" placeholder="Título" autocomplete="off">
  <div id="cuerpo" contenteditable="true" data-placeholder="Escribe algo..."></div>
  <div id="pie">
    <div id="categoria" class="c" data-c="categoria">Selecciona una categoría</div>
    <div id="opciones">${CATEGORIAS_REPLICA.map(c => `<div class="op c" data-c="op">${c}</div>`).join('')}</div>
    <div class="esp"></div>
    <button type="button" id="cancelar">CANCELAR</button>
    <button type="button" id="publicar">PUBLICAR</button>
  </div>
</div></div>
<script>
  // Delegación en la raíz, como React: ningún elemento tiene onclick ni tabindex.
  window.__estado = { abierto: false, categoria: null, vermas: 0 }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-c]')
    if (e.target.id === 'publicar') { fetch('/publicar', { method: 'POST', body: JSON.stringify({ titulo: titulo.value, cuerpo: cuerpo.innerText, categoria: __estado.categoria }) }); return }
    if (e.target.id === 'cancelar') { modal.classList.remove('abierto'); __estado.abierto = false; return }
    if (!el) return
    const c = el.dataset.c
    if (c === 'abrir') { modal.classList.add('abierto'); __estado.abierto = true; setTimeout(() => titulo.focus(), 30) }
    else if (c === 'post') location.href = '/post/' + el.dataset.n
    else if (c === 'vermas') { __estado.vermas++; el.textContent = 'Ver más publicaciones · cargadas ' + __estado.vermas }
    else if (c === 'categoria') opciones.classList.toggle('abierto')
    else if (c === 'op') { __estado.categoria = el.textContent.trim(); categoria.textContent = __estado.categoria; opciones.classList.remove('abierto') }
  })
</script>
</body></html>`

export interface ReplicaSkool { url: string; publicados: string[]; postsAbiertos: string[]; cerrar(): Promise<void> }

export async function replicaSkool(): Promise<ReplicaSkool> {
  const publicados: string[] = [], postsAbiertos: string[] = []
  const servidor: Server = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x')
    if (req.method === 'POST' && u.pathname === '/publicar') {
      let b = ''; req.on('data', d => { b += d }); req.on('end', () => { publicados.push(b); res.writeHead(200); res.end('{}') }); return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (u.pathname.startsWith('/post/')) { postsAbiertos.push(u.pathname); res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Post</title></head><body><h1>Post ${u.pathname.split('/').pop()}</h1></body></html>`); return }
    res.end(PAGINA)
  })
  await new Promise<void>(ok => servidor.listen(0, '127.0.0.1', () => ok()))
  const a = servidor.address()
  const puerto = typeof a === 'object' && a ? a.port : 0
  // La ruta imita a Skool para que la receta y el freno la traten igual (comunidad en la raíz).
  return { url: `http://127.0.0.1:${puerto}/skool-accelerator-8190`, publicados, postsAbiertos, cerrar: () => new Promise(ok => servidor.close(() => ok())) }
}
