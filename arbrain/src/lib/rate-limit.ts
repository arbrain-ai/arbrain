import { createServiceClient } from '@/lib/supabase/service'

const MAX_ATTEMPTS = 5
const WINDOW_DAYS = 7

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; retryAfterDays: number }> {
  const supabase = createServiceClient()
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('success', false)
    .gte('attempted_at', windowStart)

  const attempts = count ?? 0
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts)

  let retryAfterDays = 0
  if (attempts >= MAX_ATTEMPTS) {
    const { data: oldest } = await supabase
      .from('login_attempts')
      .select('attempted_at')
      .eq('ip_address', ip)
      .eq('success', false)
      .gte('attempted_at', windowStart)
      .order('attempted_at', { ascending: true })
      .limit(1)

    if (oldest?.[0]) {
      const expiresAt = new Date(oldest[0].attempted_at).getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000
      retryAfterDays = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    }
  }

  return { allowed: attempts < MAX_ATTEMPTS, remaining, retryAfterDays }
}

export async function recordAttempt(ip: string, email: string, success: boolean) {
  const supabase = createServiceClient()
  await supabase.from('login_attempts').insert({
    ip_address: ip,
    email,
    success,
    attempted_at: new Date().toISOString(),
  })

  // Cleanup attempts older than 30 days (fire and forget)
  supabase
    .from('login_attempts')
    .delete()
    .lt('attempted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .then(() => {})
}
