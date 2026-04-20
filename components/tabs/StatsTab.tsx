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

// SSR 비활성화 (Recharts는 브라우저 전용)
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

      {/* 누적 손익 곡선 (전체 너비) */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <h3 className="text-gray-400 text-sm font-semibold mb-3">누적 손익</h3>
        <CumulativePnlChart data={cumulativeData} />
      </div>

      {/* 월별 + 승률 (2컬럼, 모바일은 1컬럼) */}
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

      {/* R배수 분포 (전체 너비) */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <h3 className="text-gray-400 text-sm font-semibold mb-3">R배수 분포</h3>
        <RMultipleChart data={rBuckets} />
      </div>
    </div>
  )
}
