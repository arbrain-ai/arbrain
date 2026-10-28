// Poda de respaldos de Arbrain en ~/Applications (12 oct 2026). Cada instalación y cada actualización
// aplicada por la app dejaba una copia completa (~800 MB) en `.arbrain-backups` sin tope: 272 copias,
// 141 GB, y el Studio lento con 43 GB libres. Se conservan las CONSERVAR más recientes.
//
// 25 oct 2026: lo que sobra del tope se BORRA, ya no va a la Papelera. Mandarlas ahí no liberaba nada: el 25 oct
// la Papelera guardaba ~317 copias (~220 GB) y el disco bajó a 3 GB. Excepción a la Ley 1 del janitor firmada por
// Daniel ese día («de acuerdo opción 2, confío en tu autonomía»): son copias regenerables de la app y nada más.
// Candado por forma: solo se borra un `Arbrain*.app` dentro de `.arbrain-backups` o un resto de instalación con su
// patrón exacto (stage, failed, marca .json.viejo); nunca un enlace, nunca otra cosa de ~/Applications.
import { existsSync, lstatSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export const CONSERVAR = 5;
const RESTO_VIEJO_MS = 60 * 60 * 1000; // un stage de menos de 1 h puede ser de una instalación en curso
const COPIA = /^Arbrain[^/]*\.app$/;
const RESTO = /^\.Arbrain-(stage|failed)-[^/]*\.app$|^\.Arbrain-pendiente-[^/]*\.json\.viejo$/;

/** Qué borrar. Puro: recibe entradas {nombre, dir, mtimeMs} y la hora. */
export function planDePoda({ respaldos, restos }, ahora = Date.now(), conservar = CONSERVAR) {
  const viejos = [...respaldos].filter(r => COPIA.test(r.nombre)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(conservar);
  const restosViejos = restos.filter(r => RESTO.test(r.nombre) && ahora - r.mtimeMs > RESTO_VIEJO_MS);
  return [...viejos, ...restosViejos];
}

const entradas = (dir) => existsSync(dir) ? readdirSync(dir).map(nombre => ({ nombre, dir, mtimeMs: statSync(path.join(dir, nombre)).mtimeMs })) : [];

export function podarRespaldos(destinationDir, { log = console.log } = {}) {
  const backups = path.join(destinationDir, '.arbrain-backups');
  const respaldos = entradas(backups).filter(e => e.nombre.endsWith('.app'));
  const plan = planDePoda({ respaldos, restos: entradas(destinationDir) });
  if (!plan.length) return 0;
  let borrados = 0;
  for (const e of plan) {
    const ruta = path.join(e.dir, e.nombre);
    const valido = (e.dir === backups && COPIA.test(e.nombre)) || (e.dir === destinationDir && RESTO.test(e.nombre));
    if (!valido || lstatSync(ruta).isSymbolicLink()) { log(`No borro ${ruta}: no tiene forma de copia de Arbrain.`); continue; }
    try { rmSync(ruta, { recursive: true, force: true }); borrados++ } catch (error) { log(`No pude borrar ${e.nombre}: ${error.message}`) }
  }
  log(`Respaldos de Arbrain: ${borrados} copia(s) vieja(s) borradas (regenerables); se conservan las ${CONSERVAR} más recientes.`);
  return borrados;
}

if (import.meta.url === `file://${process.argv[1]}`) podarRespaldos(path.join(process.env.HOME || '', 'Applications'));
