import { describe, it, expect } from 'vitest'
import { motivoFsRechazo, rutaSecreta } from './fs-acceso.js'

const home = '/Users/alumno'
const workspace = '/Users/alumno/Arbrain'

describe('/fs del daemon (AUDITORIA I6)', () => {
  it('instalación de Daniel: todo $HOME como siempre', () => {
    expect(motivoFsRechazo('/Users/alumno/.ssh/config', { home, cliente: false, workspace })).toBeNull()
    expect(motivoFsRechazo('/etc/passwd', { home, cliente: false, workspace })).toBe('fuera de $HOME')
  })
  it('edición cliente: solo el workspace y nunca secretos', () => {
    const op = { home, cliente: true, workspace }
    expect(motivoFsRechazo('/Users/alumno/.ssh/config', op)).toBe('fuera del workspace de Arbrain')
    expect(motivoFsRechazo('/Users/alumno/Arbrain/notas/plan.md', op)).toBeNull()
    expect(motivoFsRechazo('/Users/alumno/Arbrain/.env', op)).toBe('ruta con secretos')
    expect(motivoFsRechazo('/Users/alumno/Arbrain/arbrain/server/store/claudeclaw.db', op)).toBe('ruta con secretos')
    expect(motivoFsRechazo('/Users/alumno/ArbrainOtro/x.md', op)).toBe('fuera del workspace de Arbrain')
  })
  it('secretos por nombre y por carpeta; las plantillas .example no', () => {
    expect(rutaSecreta('/w/.env.local')).toBe(true)
    expect(rutaSecreta('/w/.env.local.example')).toBe(false)
    expect(rutaSecreta('/w/.mcp.json')).toBe(true)
    expect(rutaSecreta('/w/.aws/config')).toBe(true)
    expect(rutaSecreta('/w/docs/README.md')).toBe(false)
  })
})
