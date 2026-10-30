#!/usr/bin/env node
// `npm run dev` (28 oct 2026). En el checkout designado, en la copia del alumno, en CI o fuera de macOS es `next dev
// --turbopack` de siempre. En la copia de un AGENTE (worktree de la app original) el servidor de desarrollo queda acotado:
//
//   1. Turno: toma el mismo semáforo que las compilaciones pesadas (scripts/compilacion-pesada.mjs). Máximo uno a la vez
//      en el Studio entre `next build`, Tauri y estos servidores; el que llega espera.
//   2. Memoria: NODE_OPTIONS con --max-old-space-size=4096 (sin él, `next dev` se da la MITAD de la RAM: 16 GB en el
//      Studio) y tope de TOPE_DEV_GB por proceso, que vigila el semáforo y que sí ve la memoria nativa de Turbopack.
//   3. Se apaga solo: tras INACTIVO_MIN sin peticiones ni conexiones nuevas, o al terminar las capturas (--capturas).
//      Si este proceso muere de golpe, `next.config.ts` (src/config/guardia-dev.ts) apaga el servidor en segundos.
//
// Origen: 28 oct 07:25, swap 38 de 40 GB y la UI de Daniel con lag. Dos `next-server` de worktrees de subagentes (9 y
// 7.4 GB), levantados para capturas y olvidados, más un worker de `next build` de 26 GB.
//
//   npm run dev [-- <args de next dev>]
//   npm run dev -- --capturas <comando…>    arranca, espera a que responda, corre el comando con ARBRAIN_DEV_URL y apaga.
//                                           Sale con el código del comando.
//   Pruebas: ARBRAIN_DEV_COMANDO='node servidor-falso.mjs' sustituye a `next dev`; ARBRAIN_DEV_INACTIVO_MIN acorta la espera.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GuardiaError, activa, correrPesado, esCopiaDeAgente } from './compilacion-pesada.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOPE_DEV_GB = Number(process.env.ARBRAIN_TOPE_DEV_GB) || 8;
export const HEAP_DEV_MB = 4096;
const INACTIVO_MS = (Number(process.env.ARBRAIN_DEV_INACTIVO_MIN) || 15) * 60_000;
const REVISION_MS = Math.min(30_000, INACTIVO_MS / 4);
const ARRANQUE_MAX_MS = 5 * 60_000;

/** Agrega --max-old-space-size a NODE_OPTIONS si no trae uno. */
export function conTopeDeHeap(nodeOptions = '', mb = HEAP_DEV_MB) {
  return /--max[-_]old[-_]space[-_]size/.test(nodeOptions) ? nodeOptions : `${nodeOptions} --max-old-space-size=${mb}`.trim();
}

/** Separa `[args de next dev…] [--capturas comando…]`. */
export function separar(argv) {
  const i = argv.indexOf('--capturas');
  return i === -1 ? { devArgs: argv, capturas: [] } : { devArgs: argv.slice(0, i), capturas: argv.slice(i + 1) };
}

const valorDe = (args, ...nombres) => {
  const i = args.findIndex((a) => nombres.includes(a));
  return i >= 0 ? args[i + 1] : undefined;
};

const puertoLibre = () => new Promise((resolve, reject) => {
  const s = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

/** Puertos remotos de las conexiones establecidas al puerto del servidor (una conexión nueva = alguien lo está usando). */
function conexiones(puerto) {
  return new Promise((resolve) => {
    const p = spawn('lsof', ['-nP', `-iTCP:${puerto}`, '-sTCP:ESTABLISHED', '-Fn'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => resolve(new Set(out.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1)))));
    p.on('error', () => resolve(new Set()));
  });
}

async function esperarQueResponda(url, hijo) {
  const limite = Date.now() + ARRANQUE_MAX_MS;
  while (Date.now() < limite && hijo.exitCode === null) {
    try { await fetch(url, { signal: AbortSignal.timeout(5000) }); return true; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function directo(args) {
  const bin = path.join(RAIZ, 'node_modules/.bin/next');
  const hijo = spawn(existsSync(bin) ? bin : 'next', ['dev', '--turbopack', ...args], { cwd: RAIZ, stdio: 'inherit' });
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => hijo.kill(s));
  hijo.on('exit', (c, s) => process.exit(c ?? (s ? 1 : 0)));
}

export async function acotado(devArgs, capturas) {
  const args = [...devArgs];
  let puerto = valorDe(args, '--port', '-p');
  if (!puerto) { puerto = String(await puertoLibre()); args.push('--port', puerto); }
  if (!valorDe(args, '--hostname', '-H')) args.push('--hostname', '127.0.0.1');
  const url = `http://127.0.0.1:${puerto}`;
  const [cmd, ...cmdArgs] = process.env.ARBRAIN_DEV_COMANDO
    ? process.env.ARBRAIN_DEV_COMANDO.split(' ')
    : [existsSync(path.join(RAIZ, 'node_modules/.bin/next')) ? path.join(RAIZ, 'node_modules/.bin/next') : 'next', 'dev', '--turbopack'];
  const env = {
    ...process.env,
    PORT: puerto,
    NODE_OPTIONS: conTopeDeHeap(process.env.NODE_OPTIONS),
    ARBRAIN_DEV_AGENTE: '1',
    ARBRAIN_DEV_GUARDIAN: String(process.pid),
  };
  let codigoCapturas = null;
  const etiqueta = `next dev ${path.basename(path.dirname(RAIZ))} :${puerto}`;
  const codigo = await correrPesado(cmd, [...cmdArgs, ...args], {
    etiqueta, cwd: RAIZ, env, topeGB: TOPE_DEV_GB, stdio: ['ignore', 'pipe', 'pipe'],
    alHijo(hijo, apagar) {
      let ultima = Date.now();
      let vistas = new Set();
      const actividad = (destino) => (d) => { ultima = Date.now(); destino.write(d); };
      hijo.stdout.on('data', actividad(process.stdout));
      hijo.stderr.on('data', actividad(process.stderr));
      const revisar = setInterval(async () => {
        const ahora = await conexiones(puerto);
        if ([...ahora].some((c) => !vistas.has(c))) ultima = Date.now();
        vistas = ahora;
        if (Date.now() - ultima > INACTIVO_MS) {
          console.error(`\n[dev-agente] ${INACTIVO_MS / 60_000} min sin uso: apago ${url}. Vuelve a levantarlo con npm run dev si lo necesitas.\n`);
          apagar();
        }
      }, REVISION_MS);
      hijo.on('exit', () => clearInterval(revisar));
      console.error(`[dev-agente] ${url} · tope ${TOPE_DEV_GB} GB por proceso · heap ${HEAP_DEV_MB} MB · se apaga tras ${INACTIVO_MS / 60_000} min sin uso.`);
      if (!capturas.length) return;
      void (async () => {
        if (!(await esperarQueResponda(url, hijo))) { console.error(`[dev-agente] ${url} no respondió; no corro las capturas.`); codigoCapturas = 1; apagar(); return; }
        const c = spawn(capturas[0], capturas.slice(1), { stdio: 'inherit', env: { ...process.env, ARBRAIN_DEV_URL: url } });
        c.on('error', (e) => { console.error(`[dev-agente] no pude correr las capturas: ${e.message}`); codigoCapturas = 1; apagar(); });
        c.on('exit', (cc) => { codigoCapturas = cc ?? 1; console.error(`[dev-agente] capturas terminadas (código ${codigoCapturas}): apago ${url}.`); apagar(); });
      })();
    },
  });
  return codigoCapturas ?? codigo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { devArgs, capturas } = separar(process.argv.slice(2));
  if (!activa() || !esCopiaDeAgente(RAIZ)) {
    if (capturas.length) { console.error('[dev-agente] --capturas solo aplica en copias de agentes del Studio.'); process.exit(2); }
    directo(devArgs);
  } else {
    acotado(devArgs, capturas)
      .then((c) => process.exit(c))
      .catch((e) => { console.error(e instanceof GuardiaError ? `\n${e.message}\n` : e); process.exit(e instanceof GuardiaError ? 75 : 1); });
  }
}
