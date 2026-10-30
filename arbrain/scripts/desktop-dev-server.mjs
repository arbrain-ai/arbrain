import { spawn } from 'node:child_process'

const DEV_URL = 'http://127.0.0.1:3000'
// Seguridad (AUDITORIA I5, 10 oct 2026): sin -H, `next dev` escucha en todas las interfaces con el bypass de escritorio
// encendido, y cualquiera en el mismo wifi entraba como dueño mandando `Host: localhost`. Solo loopback.
// ARBRAIN_DEV_HOST=0.0.0.0 lo abre a la red a propósito (probar desde el celular).
const DEV_HOST = process.env.ARBRAIN_DEV_HOST || '127.0.0.1'

async function isServerUp() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    const res = await fetch(DEV_URL, { signal: controller.signal })
    clearTimeout(timeout)
    return res.status < 500
  } catch {
    return false
  }
}

if (await isServerUp()) {
  console.log(`[desktop] Reusing Mission Control dev server at ${DEV_URL}`)
  process.exit(0)
}

const child = spawn('npm', ['run', 'dev', '--', '--port', '3000', '--hostname', DEV_HOST], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MISSION_CONTROL_DESKTOP_EMBED: '1',
  },
})

function forward(signal) {
  child.kill(signal)
}

process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
