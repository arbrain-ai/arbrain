import React from 'react'
// Arnés visual (Vite, sin Next): next/navigation y next/link. Cada navegación interna queda en window.__registro.router.
const anotar = (url: string) => { (window as unknown as { __registro?: { router: string[] } }).__registro?.router.push(url) }
export const useRouter = () => ({ push: anotar, replace: anotar, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} })
export const usePathname = () => '/'
export const useSearchParams = () => new URLSearchParams()
export default function Link({ href, children, onClick, ...resto }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...resto} onClick={(e) => { e.preventDefault(); onClick?.(e); anotar(href) }}>{children}</a>
}
