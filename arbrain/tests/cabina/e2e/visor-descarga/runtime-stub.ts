// Sustituto de '@/lib/local-first/runtime' en el arnés: `?escritorio=1` simula la app de escritorio (Tauri).
export const isDesktopRuntime = () => typeof window !== 'undefined' && !!(window as unknown as { __ESCRITORIO__?: boolean }).__ESCRITORIO__
