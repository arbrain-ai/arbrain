/** A pasted path is a user-selected attachment, never an instruction for an agent to read disk. */
export function localImagePath(raw: string): string | null {
  let value = raw.trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  if (value.startsWith('file://')) {
    try { const url = new URL(value); if (url.hostname && url.hostname !== 'localhost') return null; value = decodeURIComponent(url.pathname) } catch { return null }
  }
  value = value.replace(/\\ /g, ' ')
  if (!value.startsWith('/') || /[\r\n\0]/.test(value) || value.length > 4096 || !/\.(png|jpe?g|webp|gif)$/i.test(value)) return null
  return value
}

export function clipboardImages(data: Pick<DataTransfer, 'items'>): File[] {
  return Array.from(data.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file)
}

export async function readPastedImage(path: string): Promise<File> {
  if (!('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) throw new Error('Esa ruta pertenece a tu Mac. Adjunta la imagen con el clip o copia la imagen, no su ruta.')
  const { invoke } = await import('@tauri-apps/api/core')
  const image = await invoke<{ name: string; mime: string; bytes: number[] }>('read_chat_image', { path })
  return new File([new Uint8Array(image.bytes)], image.name, { type: image.mime })
}
