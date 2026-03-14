import { onCLS, onINP, onLCP, type Metric } from 'web-vitals'

type VitalName = 'LCP' | 'CLS' | 'INP'

export interface OrbitVitalsSnapshot {
  capturedAt: string
  page: string
  userAgent: string
  metrics: Partial<Record<VitalName, number>>
}

const STORAGE_KEY = 'orbit_web_vitals_baseline'

const roundMetric = (name: VitalName, value: number) => {
  // CLS usually needs 3 decimals, other vitals keep integer ms
  return name === 'CLS' ? Number(value.toFixed(3)) : Math.round(value)
}

const readSnapshot = (): OrbitVitalsSnapshot | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OrbitVitalsSnapshot
  } catch {
    return null
  }
}

const writeSnapshot = (snapshot: OrbitVitalsSnapshot) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

const buildReportText = (snapshot: OrbitVitalsSnapshot | null) => {
  if (!snapshot) {
    return '【Orbit 首屏性能基线】\n暂无数据，请先打开首页停留 3-5 秒后再导出。'
  }

  const lcp = snapshot.metrics.LCP
  const cls = snapshot.metrics.CLS
  const inp = snapshot.metrics.INP

  const lines = [
    '【Orbit 首屏性能基线】',
    `记录时间: ${snapshot.capturedAt}`,
    `页面: ${snapshot.page}`,
    `环境: ${snapshot.userAgent}`,
    '',
    `LCP: ${typeof lcp === 'number' ? `${lcp} ms` : '未采集'}`,
    `CLS: ${typeof cls === 'number' ? cls : '未采集'}`,
    `INP: ${typeof inp === 'number' ? `${inp} ms` : '未采集'}`,
  ]

  return lines.join('\n')
}

const pushMetric = (name: VitalName, metric: Metric) => {
  if (typeof window === 'undefined') return

  const prev = readSnapshot()
  const snapshot: OrbitVitalsSnapshot = {
    capturedAt: new Date().toLocaleString('zh-CN'),
    page: window.location.href,
    userAgent: navigator.userAgent,
    metrics: {
      ...(prev?.metrics || {}),
      [name]: roundMetric(name, metric.value),
    },
  }

  writeSnapshot(snapshot)

  console.log(`[Vitals] ${name}:`, snapshot.metrics[name])
}

export const startWebVitalsBaseline = () => {
  if (typeof window === 'undefined') return

  onLCP((metric) => pushMetric('LCP', metric))
  onCLS((metric) => pushMetric('CLS', metric))
  onINP((metric) => pushMetric('INP', metric))

  ;(window as any).exportOrbitWebVitalsBaseline = async () => {
    const text = buildReportText(readSnapshot())
    try {
      await navigator.clipboard.writeText(text)
      console.log('[Vitals] 已复制性能基线到剪贴板')
      return text
    } catch {
      console.log('[Vitals] 剪贴板不可用，返回文本供手动复制')
      return text
    }
  }

  ;(window as any).getOrbitWebVitalsBaseline = () => readSnapshot()
}
