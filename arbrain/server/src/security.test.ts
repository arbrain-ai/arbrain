import { afterEach, describe, expect, it } from 'vitest'
import { validateUrl } from './security.js'

const prev = process.env.MC_SUPABASE_URL
afterEach(() => { if (prev === undefined) delete process.env.MC_SUPABASE_URL; else process.env.MC_SUPABASE_URL = prev })

describe('validateUrl con Mission Control local', () => {
  it('deja pasar adjuntos del Storage propio de Mission Control', () => {
    process.env.MC_SUPABASE_URL = 'http://localhost:8000'
    expect(validateUrl('http://localhost:8000/storage/v1/object/public/chat-images/a/b.jpg')).toBeNull()
  })
  it('sigue bloqueando otras direcciones locales y otras rutas del mismo origen', () => {
    process.env.MC_SUPABASE_URL = 'http://localhost:8000'
    expect(validateUrl('http://localhost:8000/rest/v1/profiles')).toMatch(/private\/local/)
    expect(validateUrl('http://localhost:3099/model')).toMatch(/private\/local/)
    expect(validateUrl('http://127.0.0.1:8000/rest/v1/profiles')).toMatch(/private\/local/)
    expect(validateUrl('http://127.0.0.1:9000/storage/v1/object/public/x.jpg')).toMatch(/private\/local/)
    expect(validateUrl('http://10.0.0.5:8000/storage/v1/object/public/x.jpg')).toMatch(/private\/local/)
    expect(validateUrl('http://localhost:8000/storage/v1/object/../../rest/v1/x')).toMatch(/private\/local/)
  })
  it('acepta el mismo storage por 127.0.0.1 o [::1] (el upload del chat devuelve 127.0.0.1; bug 1 oct 09:31)', () => {
    process.env.MC_SUPABASE_URL = 'http://localhost:8000'
    // URL real del journal: el envío de Daniel con 3 fotos falló con «Adjunto rechazado».
    expect(validateUrl('http://127.0.0.1:8000/storage/v1/object/public/generated-images/chat-1790868678949-hpaq.png')).toBeNull()
    expect(validateUrl('http://[::1]:8000/storage/v1/object/public/x.png')).toBeNull()
    process.env.MC_SUPABASE_URL = 'http://127.0.0.1:8000'
    expect(validateUrl('http://localhost:8000/storage/v1/object/public/x.png')).toBeNull()
  })
  it('las URLs públicas siguen permitidas', () => {
    expect(validateUrl('https://example.com/a.jpg')).toBeNull()
  })
})
