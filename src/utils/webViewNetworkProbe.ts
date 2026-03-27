import { CapacitorHttp, Capacitor } from '@capacitor/core'

/** MediaUploader / others: skip local wait if global probe succeeded within this window */
export const FOREGROUND_PROBE_CACHE_MS = 60_000

const SESSION_CACHE_EXTEND_MS = 30_000

const PROBE_PING_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/`

let probeInFlight: Promise<void> | null = null

export function isForegroundProbeFresh(maxAgeMs = FOREGROUND_PROBE_CACHE_MS): boolean {
  if (typeof window === 'undefined') return false
  const t = (window as any).__orbit_webview_ready_at as number | undefined
  return !!t && Date.now() - t < maxAgeMs
}

function markProbeSuccess() {
  if (typeof window === 'undefined') return
  ;(window as any).__orbit_webview_ready_at = Date.now()
  ;(window as any).__orbit_session_valid_until = Date.now() + SESSION_CACHE_EXTEND_MS
}

/**
 * Native CapacitorHttp HEAD ping. Any HTTP response (including 4xx) = network alive.
 * Bypasses WKWebView entirely — dead TCP connections after backgrounding cannot hang.
 *
 * On web the probe succeeds immediately.
 * Dedupes concurrent callers via a shared Promise.
 */
export function runForegroundNetworkProbe(opts: {
  userId: string
  source: string
  maxMs?: number
}): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  if (probeInFlight) {
    console.log(`[foreground-probe] reusing in-flight (${opts.source})`)
    return probeInFlight
  }

  const maxMs = opts.maxMs ?? 10_000

  probeInFlight = (async () => {
    if (!Capacitor.isNativePlatform()) {
      markProbeSuccess()
      return
    }

    console.log(`[foreground-probe] start source=${opts.source} maxMs=${maxMs}`)
    const start = Date.now()
    let attempt = 0

    while (Date.now() - start < maxMs) {
      attempt++
      let pingOk = false
      try {
        await Promise.race([
          CapacitorHttp.request({ url: PROBE_PING_URL, method: 'HEAD', headers: {} }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('probe-timeout')), 3000)
          ),
        ])
        pingOk = true
      } catch {
        /* network not ready yet */
      }

      if (pingOk) {
        console.log(
          `[foreground-probe] OK source=${opts.source} attempt=${attempt} elapsed=${Date.now() - start}ms`
        )
        markProbeSuccess()
        // Best-effort REST warm-up — fire and forget, never block return
        import('../api/supabase')
          .then(({ supabase: sb }) => {
            void sb.from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('id', opts.userId)
              .limit(1)
          })
          .catch(() => {})
        return
      }

      await new Promise(r => setTimeout(r, 500))
    }

    console.warn(`[foreground-probe] timeout source=${opts.source} maxMs=${maxMs}`)
  })().finally(() => {
    probeInFlight = null
  })

  return probeInFlight
}
