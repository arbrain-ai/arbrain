export type Brief = { id: string; prompt: string; created_at: string; status: string; error: string | null }
export type Billing = { date: string; mrr_cents: number | null; active_subs: number | null; cancel_at_period_end: number | null; polar_reconciled_at: string }
export type Video = { video_id: string; title: string; published_at: string; views: number | null; avg_view_percentage?: number | null; updated_at: string | null; analytics_synced_at?: string | null; duration_seconds?: number | null; channel_name?: string; thumbnail_url?: string; link_slug?: string | null }
export type Overview = { ownerId: string; billing: Billing | null; previousBilling?: Billing | null; history?: Pick<Billing, 'date' | 'mrr_cents' | 'active_subs'>[]; briefs: Brief[]; issues: string[]; loadedAt: string }
export type Videos = { ownerId: string; videos: Video[]; loadedAt: string; limited: boolean }
export const briefNames: Record<string,string> = { 'morning-briefing':'Reporte diario', 'business-council':'Reporte semanal', 'monthly-review':'Reporte mensual' }
export function stamp(value?: string | null) { return value ? new Date(value).toLocaleString('es-MX', {timeZone:'America/Mexico_City',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Sin fecha de actualización' }
export function numeric(value?: number | null) { return value == null ? 'Sin dato' : value.toLocaleString('es-MX') }
