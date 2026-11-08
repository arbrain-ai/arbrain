// Sustituto de 'next/navigation' en el arnés: el .md (MarkdownMessage) pide el router y aquí no hay app de Next.
export const useRouter = () => ({ push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} })
export const usePathname = () => '/'
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
