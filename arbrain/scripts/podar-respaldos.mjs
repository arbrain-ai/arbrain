// Poda de respaldos de Arbrain en ~/Applications (12 oct 2026). Cada instalación y cada actualización
// aplicada por la app dejaba una copia completa (~800 MB) en `.arbrain-backups` sin tope: 272 copias,
// 141 GB, y el Studio lento con 43 GB libres. Se conservan las CONSERVAR más recientes; el resto, y los
// restos de instalaciones viejas (stage, failed, marcas .json.viejo), van a la Papelera: nada se borra.
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export const CONSERVAR = 5;
const RESTO_VIEJO_MS = 60 * 60 * 1000; // un stage de menos de 1 h puede ser de una instalación en curso

/** Qué mover a la Papelera. Puro: recibe entradas {nombre, dir, mtimeMs} y la hora. */
export function planDePoda({ respaldos, restos }, ahora = Date.now(), conservar = CONSERVAR) {
  const viejos = [...respaldos].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(conservar);
  const restosViejos = restos.filter(r => /^\.Arbrain-(stage|failed)-.*\.app$|^\.Arbrain-pendiente-.*\.json\.viejo$/.test(r.nombre) && ahora - r.mtimeMs > RESTO_VIEJO_MS);
  return [...viejos, ...restosViejos];
}

const entradas = (dir) => existsSync(dir) ? readdirSync(dir).map(nombre => ({ nombre, dir, mtimeMs: statSync(path.join(dir, nombre)).mtimeMs })) : [];

export function podarRespaldos(destinationDir, { papelera = path.join(process.env.HOME || '', '.Trash'), log = console.log } = {}) {
  const respaldos = entradas(path.join(destinationDir, '.arbrain-backups')).filter(e => e.nombre.endsWith('.app'));
  const plan = planDePoda({ respaldos, restos: entradas(destinationDir) });
  if (!plan.length) return 0;
  mkdirSync(papelera, { recursive: true });
  let movidos = 0;
  for (const e of plan) {
    let destino = path.join(papelera, e.nombre);
    if (existsSync(destino)) destino = path.join(papelera, `${e.nombre.replace(/(\.app|\.json\.viejo)$/, '')}-${Date.now()}${e.nombre.match(/(\.app|\.json\.viejo)$/)?.[0] ?? ''}`);
    try { renameSync(path.join(e.dir, e.nombre), destino); movidos++ } catch (error) { log(`No pude mover ${e.nombre} a la Papelera: ${error.message}`) }
  }
  log(`Respaldos de Arbrain: ${movidos} copia(s) vieja(s) a la Papelera; se conservan las ${CONSERVAR} más recientes.`);
  return movidos;
}

if (import.meta.url === `file://${process.argv[1]}`) podarRespaldos(path.join(process.env.HOME || '', 'Applications'));
