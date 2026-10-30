// El build que sirve este servidor. La app de escritorio lo compara con el suyo para recargar tras un deploy.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_ARBRAIN_BUILD ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
