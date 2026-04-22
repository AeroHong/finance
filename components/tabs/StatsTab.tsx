'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Trade } from '@/lib/types'
import {
  buildCumulativeSeries,
  groupByMonth,
  buildRBuckets,
  calcAdvancedStats,
} from '@/lib/chartUtils'

const CumulativePnlChart = dynamic(
  () => import('@/components/charts/CumulativePnlChart'),
  { ssr: false }
)
const MonthlyPnlChart = dynamic(
  () => import('@/components/charts/MonthlyPnlChart'),
  { ssr: false }
)
const WinRatePieChart = dynamic(
  () => import('@/components/charts/WinRatePieChart'),
  { ssr: false }
)
const RMultipleChart = dynamic(
  () => import('@/components/charts/RMultipleChart'),
  { ssr: false }
)

interface Props {
  trades: Trade[]
  loading: boolean
}

function formatTs(ts: { toDate(): Date } | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function exportTradesToCsv(trades: Trade[]) {
  const headers = [
    '청산시간', '방향', '심볼', '청산평단가', '수량(BTC)', '레버리지',
    '손익(USDT)', '수익률(%)', '수수료', 'R배수', '보유시간(h)',
    '진입타입', '진입근거', '청산근거', '반성', '교훈', '태그',
  ]

  const sorted = [...trades].sort(
    (a, b) => (a.exitTime ?? a.entryTime).toMillis() - (b.exitTime ?? b.entryTime).toMillis()
  )

  const rows = sorted.map((t) => [
    formatTs(t.exitTime ?? t.entryTime),
    t.direction === 'long' ? '롱' : '숏',
    t.symbol,
    t.entryPrice,
    t.quantity,
    t.leverage || '',
    t.profitLoss ?? '',
    t.profitPct ?? '',
    t.fee,
    t.rMultiple ?? '',
    t.durationHours != null ? t.durationHours.toFixed(2) : '',
    t.entryType,
    t.entryReason,
    t.exitReason,
    t.notes,
    t.lesson,
    t.tags.join(' / '),
  ])

  const csvContent =
    '\uFEFF' + // BOM for Excel UTF-8
    [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const now = new Date()
  const filename = `매매일지_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.csv`
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function StatsTab({ trades, loading }: Props) {
  const cumulativeData = useMemo(() => buildCumulativeSeries(trades), [trades])
  const monthlyData = useMemo(() => groupByMonth(trades), [trades])
  const rBuckets = useMemo(() => buildRBuckets(trades), [trades])
  const advStats = useMemo(() => calcAdvancedStats(trades), [trades])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        통계 불러오는 중...
      </div>
    )
  }

  const fmt = (v: number | null, digits = 2) =>
    v != null ? v.toFixed(digits) : 'N/A'

  return (
    <div className="space-y-4">
      {/* 상단 헤더 + 보고서 다운로드 */}
      <div className="flex items-center justify-between">
        <h2 className="text-gray-400 text-sm font-semibold">통계 ({trades.length}건)</h2>
        <button
          onClick={() => exportTradesToCsv(trades)}
          disabled={trades.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-xs rounded-xl transition-colors"
        >
          <span>⬇</span>
          <span>CSV 다운로드</span>
        </button>
      </div>

      {/* 고급 지표 요약 카드 */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <h3 className="text-gray-400 text-sm font-semibold mb-3">고급 지표</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-white font-bold text-lg">{fmt(advStats.avgPayoffRatio)}</div>
            <div className="text-gray-500 text-xs mt-0.5">평균 손익비</div>
            <div className="text-gray-600 text-xs mt-1">
              {advStats.avgWin != null ? `+${advStats.avgWin.toFixed(1)}` : '—'}
              {' / '}
              {advStats.avgLoss != null ? advStats.avgLoss.toFixed(1) : '—'}
            </div>
          </div>
          <div>
            <div className="text-white font-bold text-lg">{fmt(advStats.sharpeRatio, 3)}</div>
            <div className="text-gray-500 text-xs mt-0.5">샤프 비율</div>
            <div className="text-gray-600 text-xs mt-1">mean / std</div>
          </div>
          <div>
            <div className="text-white font-bold text-lg">{fmt(advStats.sortinoRatio, 3)}</div>
            <div className="text-gray-500 text-xs mt-0.5">소르티노</div>
            <div className="text-gray-600 text-xs mt-1">mean / downStd</div>
          </div>
        </div>
      </div>

      {/* 누적 손익 곡선 */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <h3 className="text-gray-400 text-sm font-semibold mb-3">누적 손익</h3>
        <CumulativePnlChart data={cumulativeData} />
      </div>

      {/* 월별 + 승률 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-2xl p-4">
          <h3 className="text-gray-400 text-sm font-semibold mb-3">월별 손익</h3>
          <MonthlyPnlChart data={monthlyData} />
        </div>
        <div className="bg-gray-900 rounded-2xl p-4">
          <h3 className="text-gray-400 text-sm font-semibold mb-3">승/패 비율</h3>
          <WinRatePieChart allTrades={trades} />
        </div>
      </div>

      {/* R배수 분포 */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <h3 className="text-gray-400 text-sm font-semibold mb-3">R배수 분포</h3>
        <RMultipleChart data={rBuckets} />
      </div>
    </div>
  )
}
