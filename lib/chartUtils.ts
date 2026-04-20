import { Trade } from '@/lib/types'

export interface CumulativePoint {
  date: string
  cumulative: number
  pnl: number
}

export interface MonthlyBar {
  month: string      // "2026-04"
  profit: number
  trades: number
  winRate: number
}

export interface RBucket {
  label: string
  count: number
  isPositive: boolean
}

// ── 누적 손익 시리즈 ────────────────────────────────────────────
export function buildCumulativeSeries(trades: Trade[]): CumulativePoint[] {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.profitLoss != null)
    .sort((a, b) => a.entryTime.toMillis() - b.entryTime.toMillis())

  let cumulative = 0
  return closed.map((t) => {
    cumulative += t.profitLoss ?? 0
    const d = t.entryTime.toDate()
    const date = `${d.getMonth() + 1}/${d.getDate()}`
    return { date, cumulative: parseFloat(cumulative.toFixed(2)), pnl: t.profitLoss ?? 0 }
  })
}

// ── 월별 집계 ───────────────────────────────────────────────────
export function groupByMonth(trades: Trade[]): MonthlyBar[] {
  const closed = trades.filter((t) => t.status === 'closed' && t.profitLoss != null)

  const map = new Map<string, { profit: number; total: number; wins: number }>()

  for (const t of closed) {
    const d = t.entryTime.toDate()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const prev = map.get(key) ?? { profit: 0, total: 0, wins: 0 }
    map.set(key, {
      profit: prev.profit + (t.profitLoss ?? 0),
      total: prev.total + 1,
      wins: prev.wins + ((t.profitLoss ?? 0) > 0 ? 1 : 0),
    })
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      profit: parseFloat(v.profit.toFixed(2)),
      trades: v.total,
      winRate: v.total ? parseFloat(((v.wins / v.total) * 100).toFixed(1)) : 0,
    }))
}

// ── R배수 버킷 ─────────────────────────────────────────────────
const R_BUCKETS: Array<{ label: string; min: number; max: number; isPositive: boolean }> = [
  { label: '<-2',  min: -Infinity, max: -2,       isPositive: false },
  { label: '-2~-1', min: -2,       max: -1,       isPositive: false },
  { label: '-1~0', min: -1,       max: 0,         isPositive: false },
  { label: '0~1',  min: 0,        max: 1,         isPositive: true  },
  { label: '1~2',  min: 1,        max: 2,         isPositive: true  },
  { label: '2~3',  min: 2,        max: 3,         isPositive: true  },
  { label: '>3',   min: 3,        max: Infinity,  isPositive: true  },
]

export function buildRBuckets(trades: Trade[]): RBucket[] {
  const withR = trades.filter(
    (t) => t.status === 'closed' && t.rMultiple != null
  )

  return R_BUCKETS.map(({ label, min, max, isPositive }) => ({
    label,
    isPositive,
    count: withR.filter((t) => {
      const r = t.rMultiple!
      return r >= min && r < max
    }).length,
  }))
}

// ── 고급 통계 지표 ──────────────────────────────────────────────
export interface AdvancedStats {
  avgPayoffRatio: number | null
  sharpeRatio: number | null
  sortinoRatio: number | null
  avgWin: number | null
  avgLoss: number | null  // 음수 그대로
}

export function calcAdvancedStats(trades: Trade[]): AdvancedStats {
  const closed = trades.filter((t) => t.status === 'closed' && t.profitLoss != null)
  if (closed.length < 2) return { avgPayoffRatio: null, sharpeRatio: null, sortinoRatio: null, avgWin: null, avgLoss: null }

  const pnls = closed.map((t) => t.profitLoss!)
  const winPnls = pnls.filter((v) => v > 0)
  const lossPnls = pnls.filter((v) => v < 0)

  const avgWin = winPnls.length ? winPnls.reduce((s, v) => s + v, 0) / winPnls.length : null
  const avgLoss = lossPnls.length ? lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length : null
  const avgLossAbs = avgLoss != null ? Math.abs(avgLoss) : null
  const avgPayoffRatio =
    avgWin != null && avgLossAbs != null && avgLossAbs > 0
      ? avgWin / avgLossAbs
      : null

  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length
  const variance = pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length
  const stddev = Math.sqrt(variance)
  const sharpeRatio = stddev > 0 ? mean / stddev : null

  const downVariance = pnls.reduce((s, v) => s + Math.pow(Math.min(v, 0), 2), 0) / pnls.length
  const downStddev = Math.sqrt(downVariance)
  const sortinoRatio = downStddev > 0 ? mean / downStddev : null

  return {
    avgPayoffRatio: avgPayoffRatio != null ? parseFloat(avgPayoffRatio.toFixed(2)) : null,
    sharpeRatio: sharpeRatio != null ? parseFloat(sharpeRatio.toFixed(3)) : null,
    sortinoRatio: sortinoRatio != null ? parseFloat(sortinoRatio.toFixed(3)) : null,
    avgWin,
    avgLoss,
  }
}
