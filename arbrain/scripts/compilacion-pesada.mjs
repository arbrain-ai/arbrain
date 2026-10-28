#!/usr/bin/env node
// Compilaciones pesadas del Studio (25 oct 2026, firmado por Daniel: «de acuerdo opción 2, confío en tu autonomía»).
// El disco bajó a 3 GB con compilaciones en paralelo (Tauri/cargo + next build de varios agentes) mientras el
// janitor miraba cada hora. Aquí vive la guardia EN CÓDIGO que antes era texto (la regla de 8 GB del 3 oct):
//
//   1. Piso de disco: con menos de PISO_GB libres no se compila; se aborta con mensaje claro.
//   2. Checkout designado: src-tauri de la instalación original solo se compila en CHECKOUT_DESIGNADO ($HOME/Developer/artificial-brain/arbrain)
//      (un target de ~20 GB por copia es lo que llenaba el disco). La copia del alumno no trae
//      tauri.original.conf.json y no la toca esta regla.
//   3. Semáforo: una sola compilación pesada a la vez en la máquina. Las que llegan esperan (con timeout); un
//      proceso hijo de la que tiene el turno (tauri → beforeBuildCommand → next build) entra sin volver a pedirlo.
//   4. Pausa: si el vigía de disco (server/scripts/vigia-disco.sh) deja la marca de pausa, las que esperan siguen
//      esperando y la que corre se congela (SIGSTOP) hasta que el disco se recupere (SIGCONT).
//
//   5. Tope de memoria (28 oct 2026): ningún proceso del grupo pasa de TOPE_PROCESO_GB. Un worker de `next build` llegó a
//      43 GB (25 oct) y a 26 GB (28 oct) y llevó el swap a 38 de 40 GB. Esa memoria NO es heap de V8 (el Studio le da
//      4 GB por defecto a cada worker y Next quita --max-old-space-size a los de prerender): es memoria nativa o externa
//      (búferes del caché persistente de webpack, que en producción se guarda sin comprimir y con
//      maxMemoryGenerations: Infinity, y el SWC nativo). NODE_OPTIONS no la ve; este vigilante sí: lee el RSS del grupo
//      cada pocos segundos y, si un proceso pasa el tope, detiene el grupo entero y lo anota en la bitácora.
//      Tope por PROCESO, no por grupo: cargo corre 10 rustc en paralelo de 1 a 2 GB cada uno y eso es sano.
//
// Fuera de macOS, en CI o en Vercel no hace nada: ahí no hay Studio que cuidar.
//
//   Uso:  node scripts/compilacion-pesada.mjs [--etiqueta <nombre>] -- <comando> [args…]
//   Prueba: ARBRAIN_DISCO_LIBRE_GB_SIMULADO=10 (solo puede BAJAR la lectura real; nunca sirve de bypass).
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.HOME || '';
// La variable solo puede SUBIR el piso: bajarlo sería un bypass de la guardia.
export const PISO_GB = Math.max(15, Number(process.env.ARBRAIN_PISO_DISCO_GB) || 0);
export const CHECKOUT_DESIGNADO = path.join(HOME, 'Developer/artificial-brain/arbrain');
// Un solo target de cargo para la app original: el del checkout designado. Cualquier compilación que la guardia
// deje pasar escribe ahí, nunca un target nuevo por copia.
export const CARGO_TARGET_COMPARTIDO = path.join(CHECKOUT_DESIGNADO, 'src-tauri/target');
const ESTADO = process.env.ARBRAIN_COMPILACION_ESTADO || path.join(HOME, '.claudeclaw');
export const CANDADO = path.join(ESTADO, 'compilacion-pesada.lock');
export const PAUSA = path.join(ESTADO, 'builds-pausa');
const ESPERA_MAX_MS = Number(process.env.ARBRAIN_SEMAFORO_TIMEOUT_MIN || 45) * 60_000;
const CONGELADA_MAX_MS = Number(process.env.ARBRAIN_PAUSA_MAX_MIN || 30) * 60_000;
const SONDEO_MS = Number(process.env.ARBRAIN_SEMAFORO_SONDEO_MS || 5000);
const ENV_TURNO = 'ARBRAIN_COMPILACION_TURNO';
// Medido el 28 oct: un deploy sano termina en ~2 min; 12 GB en UN proceso es un build desbocado, no uno grande.
export const TOPE_PROCESO_GB = Number(process.env.ARBRAIN_TOPE_PROCESO_GB) || 12;
const GRACIA_KILL_MS = 10_000;

export const activa = () => process.platform === 'darwin' && !process.env.CI && !process.env.VERCEL;
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };

export function libresGB(ruta = HOME || '/') {
  const r = spawnSync('df', ['-k', ruta], { encoding: 'utf8' });
  const kb = Number((r.stdout || '').trim().split('\n').pop()?.split(/\s+/)[3]);
  const medidos = Number.isFinite(kb) ? kb / 1048576 : Infinity;
  const simulado = Number(process.env.ARBRAIN_DISCO_LIBRE_GB_SIMULADO);
  return Number.isFinite(simulado) ? Math.min(medidos, simulado) : medidos;
}

export class GuardiaError extends Error {}

/** Lanza GuardiaError si hay menos de PISO_GB libres. */
export function guardiaDisco(que = 'compilar') {
  if (!activa()) return;
  const libres = libresGB();
  if (libres < PISO_GB) {
    throw new GuardiaError(`DISCO: ${libres.toFixed(1)} GB libres, el piso es ${PISO_GB} GB. No voy a ${que}: una compilación ` +
      `pesada escribe 10–20 GB y llenaría el Studio. Libera espacio primero (FORCE=1 bash arbrain/server/scripts/sistema-janitor.sh) ` +
      `o avisa al dueño del Studio. Regla firmada el 25 oct 2026, docs/builds/disco-2026-10-25/.`);
  }
}

/** ¿`raiz` es una copia de la app original (trae tauri.original.conf.json) distinta del checkout designado? = worktree de agente. */
export function esCopiaDeAgente(raiz) {
  return existsSync(path.join(raiz, 'src-tauri/tauri.original.conf.json')) && real(raiz) !== real(CHECKOUT_DESIGNADO);
}

/** Lanza GuardiaError si `raiz` es una copia de la app original que no es el checkout designado. */
export function guardiaCheckout(raiz) {
  if (!activa()) return;
  if (!esCopiaDeAgente(raiz)) return; // copia del alumno (sin tauri.original.conf.json): su máquina, su regla
  throw new GuardiaError(`src-tauri solo se compila en el checkout designado (${CHECKOUT_DESIGNADO}), no en ${raiz}. ` +
    `Cada copia levantaba su propio target de ~20 GB. En un worktree verifica en la web del Studio (127.0.0.1:3300) ` +
    `o pide el build en el checkout designado. Regla del 3 oct, en código desde el 25 oct 2026.`);
}

const leerDueno = () => { try { return JSON.parse(readFileSync(path.join(CANDADO, 'dueno.json'), 'utf8')); } catch { return null; } };
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export const pausada = () => existsSync(PAUSA);
const motivoPausa = () => { try { return readFileSync(PAUSA, 'utf8').trim().split('\n')[0]; } catch { return ''; } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function intentarTomar(etiqueta) {
  mkdirSync(ESTADO, { recursive: true });
  try {
    mkdirSync(CANDADO); // atómico: solo uno lo crea
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const d = leerDueno();
    // Candado huérfano: su dueño murió, o quedó a medio crear hace más de un minuto.
    const huerfano = d ? !vivo(d.pid) : Date.now() - statSync(CANDADO).mtimeMs > 60_000;
    if (!huerfano) return false;
    rmSync(CANDADO, { recursive: true, force: true });
    return intentarTomar(etiqueta);
  }
  writeFileSync(path.join(CANDADO, 'dueno.json'), JSON.stringify({ pid: process.pid, etiqueta, cwd: process.cwd(), desde: new Date().toISOString() }));
  return true;
}

function soltar() {
  const d = leerDueno();
  if (d?.pid === process.pid) rmSync(CANDADO, { recursive: true, force: true });
}

/** Espera turno (y que no haya pausa). Devuelve una función para soltarlo; null si ya lo tiene un ancestro. */
export async function tomarTurno(etiqueta, { log = console.error } = {}) {
  if (!activa()) return null;
  const heredado = Number(process.env[ENV_TURNO]);
  if (heredado && leerDueno()?.pid === heredado && vivo(heredado)) return null; // hijo de quien tiene el turno
  const limite = Date.now() + ESPERA_MAX_MS;
  let avisado = '';
  for (;;) {
    if (!pausada() && intentarTomar(etiqueta)) break;
    const d = leerDueno();
    const razon = pausada() ? `builds en pausa por el vigía de disco (${motivoPausa()})` : `compilando ${d?.etiqueta ?? '?'} (pid ${d?.pid ?? '?'}, desde ${d?.desde ?? '?'})`;
    if (razon !== avisado) { log(`[semáforo] Espero turno para ${etiqueta}: ${razon}.`); avisado = razon; }
    if (Date.now() > limite) throw new GuardiaError(`[semáforo] ${etiqueta}: pasaron ${ESPERA_MAX_MS / 60_000} min esperando (${razon}). No compilé.`);
    await dormir(SONDEO_MS);
  }
  process.env[ENV_TURNO] = String(process.pid);
  const salir = () => soltar();
  process.on('exit', salir);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(s, () => { soltar(); process.exit(130); });
  return () => { process.off('exit', salir); soltar(); };
}

/** Del texto de `ps -axo pid=,pgid=,rss=,command=`, el proceso del grupo `pgid` con más memoria residente. */
export function mayorDelGrupo(texto, pgid) {
  let mayor = null;
  for (const linea of texto.split('\n')) {
    const m = linea.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!m || Number(m[2]) !== pgid) continue;
    const gb = Number(m[3]) / 1048576; // ps da KB
    if (!mayor || gb > mayor.gb) mayor = { pid: Number(m[1]), gb, cmd: m[4].slice(0, 160) };
  }
  return mayor;
}

const leerPs = () => spawnSync('ps', ['-axo', 'pid=,pgid=,rss=,command='], { encoding: 'utf8' }).stdout || '';

/**
 * Deja rastro de un evento del semáforo: línea en ~/.claudeclaw/logs/semaforo.jsonl y, si la web contesta, entrada en la
 * bitácora del Taller (kind sistema: lo atiende Levy, no suena la campana de Daniel). Nunca falla por no poder avisar.
 */
export async function anotar(titulo, cuerpo) {
  try {
    mkdirSync(path.join(ESTADO, 'logs'), { recursive: true });
    appendFileSync(path.join(ESTADO, 'logs', 'semaforo.jsonl'), JSON.stringify({ ts: new Date().toISOString(), titulo, cuerpo }) + '\n');
  } catch { /* sin log no se detiene nada */ }
  if (!activa() || process.env.ARBRAIN_SEMAFORO_SIN_BITACORA === '1') return;
  try {
    const envServidor = readFileSync(path.join(HOME, 'Developer/artificial-brain/arbrain/server/.env'), 'utf8');
    const token = envServidor.match(/^OPENCLAW_GATEWAY_TOKEN=(.*)$/m)?.[1]?.trim();
    if (!token) return;
    await fetch('http://127.0.0.1:3300/api/notifications/send', {
      method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titulo, body: cuerpo, url: '/', tag: 'semaforo-tope', source: 'semaforo', kind: 'sistema' }), // sin userId: le llega al dueño
    });
  } catch { /* sin web: queda el log */ }
}

/**
 * Corre un comando pesado con guardia de disco, turno, supervisión de pausa y tope de memoria. Devuelve el código de
 * salida (137 si lo detuvo el tope). El hijo va en su propio grupo de procesos para poder congelarlo o detenerlo entero
 * (cargo + rustc, next + workers).
 *   topeGB: memoria máxima de un proceso del grupo. stdio: como en spawn (dev-agente.mjs lee la salida del servidor).
 *   alHijo(hijo, apagar): se llama al nacer el hijo; `apagar()` detiene el grupo (TERM y, a los 10 s, KILL).
 */
export async function correrPesado(cmd, args, { etiqueta = path.basename(cmd), cwd = process.cwd(), env = process.env, log = console.error,
  topeGB = TOPE_PROCESO_GB, stdio = 'inherit', alHijo } = {}) {
  const soltarTurno = await tomarTurno(etiqueta, { log });
  try {
    guardiaDisco(`correr ${etiqueta}`); // de nuevo: mientras esperaba, otro pudo comerse el disco
    if (!activa()) return spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
    const hijo = spawn(cmd, args, { cwd, env: { ...env, [ENV_TURNO]: process.env[ENV_TURNO] ?? '' }, stdio, detached: true });
    const grupo = (senal) => { try { process.kill(-hijo.pid, senal); } catch { /* ya salió */ } };
    let apagando = false;
    const apagar = () => {
      if (apagando) return;
      apagando = true;
      grupo('SIGCONT'); grupo('SIGTERM');
      setTimeout(() => grupo('SIGKILL'), GRACIA_KILL_MS).unref();
    };
    let topeRebasado = null;
    alHijo?.(hijo, apagar);
    const reenviar = (s) => () => grupo(s);
    const senales = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, reenviar(s)]));
    for (const [s, f] of Object.entries(senales)) process.on(s, f);
    let congeladaDesde = 0;
    const vigilante = setInterval(() => {
      const mayor = topeRebasado ? null : mayorDelGrupo(leerPs(), hijo.pid);
      if (mayor && mayor.gb > topeGB) {
        topeRebasado = mayor;
        const cuerpo = `${etiqueta} (cwd ${cwd}): el proceso ${mayor.pid} llegó a ${mayor.gb.toFixed(1)} GB y el tope es ${topeGB} GB. ` +
          `Detuve el grupo entero antes de que llenara el swap. Proceso: ${mayor.cmd}`;
        log(`\n[semáforo] TOPE DE MEMORIA: ${cuerpo}\n`);
        void anotar(`🟠 Semáforo detuvo ${etiqueta}: ${mayor.gb.toFixed(1)} GB en un proceso`, cuerpo);
        apagar();
      }
      if (pausada() && !congeladaDesde) {
        congeladaDesde = Date.now();
        grupo('SIGSTOP');
        log(`[semáforo] ${etiqueta} CONGELADA: ${motivoPausa()}. Sigue sola cuando el disco se recupere.`);
      } else if (!pausada() && congeladaDesde) {
        congeladaDesde = 0;
        grupo('SIGCONT');
        log(`[semáforo] ${etiqueta} sigue: el vigía levantó la pausa.`);
      } else if (congeladaDesde && Date.now() - congeladaDesde > CONGELADA_MAX_MS) {
        log(`[semáforo] ${etiqueta}: ${CONGELADA_MAX_MS / 60_000} min congelada sin que el disco se recupere. La detengo.`);
        grupo('SIGTERM'); grupo('SIGCONT');
        congeladaDesde = 0;
      }
    }, SONDEO_MS);
    const codigo = await new Promise((r) => hijo.on('exit', (c, s) => r(c ?? (s ? 1 : 0))));
    clearInterval(vigilante);
    for (const [s, f] of Object.entries(senales)) process.off(s, f);
    return topeRebasado ? 137 : codigo;
  } finally {
    soltarTurno?.();
  }
}

// ¿Se corre directo (npm run build) o lo importa otro script? Comparar rutas reales: en Windows `argv[1]` es
// `D:\\a\\…` y la URL `file:///D:/a/…`, y la comparación de texto fallaba en silencio (salía 0 sin compilar: build y
// smoke de Windows, v0.2.13).
export function esPrincipal(url = import.meta.url, entrada = process.argv[1]) {
  if (!entrada) return false;
  try { return realpathSync(entrada) === realpathSync(fileURLToPath(url)); } catch { return path.resolve(entrada) === fileURLToPath(url); }
}

if (esPrincipal()) {
  const argv = process.argv.slice(2);
  const corte = argv.indexOf('--');
  const opciones = corte === -1 ? [] : argv.slice(0, corte);
  const [cmd, ...args] = corte === -1 ? argv : argv.slice(corte + 1);
  const i = opciones.indexOf('--etiqueta');
  if (!cmd) { console.error('uso: compilacion-pesada.mjs [--etiqueta x] -- <comando> [args…]'); process.exit(2); }
  // npm agrega node_modules/.bin al PATH: `-- next build` resuelve el next local.
  correrPesado(cmd, args, { etiqueta: i >= 0 ? opciones[i + 1] : cmd })
    .then((c) => process.exit(c))
    .catch((e) => { console.error(e instanceof GuardiaError ? `\n${e.message}\n` : e); process.exit(e instanceof GuardiaError ? 75 : 1); });
}
