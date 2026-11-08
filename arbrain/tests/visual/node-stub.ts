// Arnés de Ajustes (4 nov 2026): ModalAjustes arrastra módulos de servidor (rutas de instalación, estado del primer arranque)
// que leen node:os/fs/path al cargarse. En el navegador no corren; este stub solo deja cargar el modal. Nada aquí se ejecuta.
const nada = () => ''
export const homedir = () => '/'
export const tmpdir = () => '/tmp'
export const platform = () => 'darwin'
export const join = (...p: string[]) => p.join('/')
export const resolve = join
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/') || '/'
export const basename = (p: string) => p.split('/').pop() ?? ''
export const sep = '/'
export const existsSync = () => false
export const readFileSync = nada
export const writeFileSync = nada
export const mkdirSync = nada
export const renameSync = nada
export const chmodSync = nada
export const statSync = () => ({ mtimeMs: 0, isDirectory: () => false })
export const readdirSync = () => []
export const fileURLToPath = (u: string) => String(u)
export const execFileSync = nada
export const randomBytes = () => ({ toString: nada })
export const copyFileSync = nada
export const linkSync = nada
export const unlinkSync = nada
export const rmSync = nada
export const appendFileSync = nada
export const randomUUID = () => '00000000-0000-4000-8000-000000000000'
export const createHash = () => ({ update: () => ({ digest: nada }) })
export default { homedir, tmpdir, platform, join, resolve, dirname, basename, sep, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync, statSync, readdirSync, fileURLToPath, execFileSync, randomBytes, copyFileSync, linkSync, unlinkSync, rmSync, appendFileSync, randomUUID, createHash }
