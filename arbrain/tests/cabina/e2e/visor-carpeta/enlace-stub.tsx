// Sustituto de 'next/link' en el arnés: un <a> sin router.
import { forwardRef, type AnchorHTMLAttributes } from 'react'
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: unknown; prefetch?: unknown; replace?: unknown; scroll?: unknown }
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, replace: _r, scroll: _s, ...resto }, ref) {
  return <a ref={ref} href={typeof href === 'string' ? href : '#'} {...resto} />
})
export default Link
