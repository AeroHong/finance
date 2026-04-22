'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import * as XLSX from 'xlsx'
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

function exportToExcel(trades: Trade[]) {
  const wb = XLSX.utils.book_new()

  const sorted = [...trades].sort(
    (a, b) => (a.exitTime ?? a.entryTime).toMillis() - (b.exitTime ?? b.entryTime).toMillis()
  )

  // ── Sheet 1: 거래 목록 ────────────────────────────────
  const tradeRows = sorted.map((t) => ({
    '청산시간': formatTs(t.exitTime ?? t.entryTime),
    '방향': t.direction === 'long' ? '롱' : '숏',
    '심볼': t.symbol,
    '청산평단가': t.entryPrice,
    '수량(BTC)': t.quantity,
    '레버리지': t.leverage || '',
    '손익(USDT)': t.profitLoss ?? '',
    '수익률(%)': t.profitPct != null ? parseFloat(t.profitPct.toFixed(2)) : '',
    '수수료': t.fee,
    'R배수': t.rMultiple != null ? parseFloat(t.rMultiple.toFixed(3)) : '',
    '보유시간(h)': t.durationHours != null ? parseFloat(t.durationHours.toFixed(2)) : '',
    '진입타입': t.entryType,
    '진입근거': t.entryReason,
    '청산근거': t.exitReason,
    '반성': t.notes,
    '교훈': t.lesson,
    '태그': t.tags.join(' / '),
  }))
  const wsTradeList = XLSX.utils.json_to_sheet(tradeRows)
  wsTradeList['!cols'] = [
    { wch: 18 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
    { wch: 30 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, wsTradeList, '거래목록')

  // ── Sheet 2: 통계 요약 ────────────────────────────────
  const closed = sorted.filter((t) => t.profitLoss != null)
  const wins = closed.filter((t) => (t.profitLoss ?? 0) > 0)
  const losses = closed.filter((t) => (t.profitLoss ?? 0) < 0)
  const totalPnl = closed.reduce((s, t) => s + (t.profitLoss ?? 0), 0)
  const totalFee = closed.reduce((s, t) => s + t.fee, 0)
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const avgWin = wins.length ? wins.reduce((s, t) => s + (t.profitLoss ?? 0), 0) / wins.length : null
  const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.profitLoss ?? 0), 0) / losses.length : null

  const pnls = closed.map((t) => t.profitLoss!)
  const mean = pnls.length ? pnls.reduce((s, v) => s + v, 0) / pnls.length : 0
  const variance = pnls.length ? pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length : 0
  const stddev = Math.sqrt(variance)
  const sharpe = stddev > 0 ? mean / stddev : null
  const downVar = pnls.length ? pnls.reduce((s, v) => s + Math.pow(Math.min(v, 0), 2), 0) / pnls.length : 0
  const downStd = Math.sqrt(downVar)
  const sortino = downStd > 0 ? mean / downStd : null
  const avgPayoff = avgWin != null && avgLoss != null && avgLoss !== 0
    ? Math.abs(avgWin / avgLoss) : null

  const maxDrawdown = (() => {
    let peak = 0, cum = 0, maxDD = 0
    for (const t of sorted) {
      cum += t.profitLoss ?? 0
      if (cum > peak) peak = cum
      const dd = peak - cum
      if (dd > maxDD) maxDD = dd
    }
    return maxDD
  })()

  const bestTrade = closed.length ? Math.max(...closed.map((t) => t.profitLoss ?? 0)) : null
  const worstTrade = closed.length ? Math.min(...closed.map((t) => t.profitLoss ?? 0)) : null

  const summaryRows = [
    { '항목': '=== 거래 개요 ===' },
    { '항목': '총 거래 수', '값': closed.length },
    { '항목': '승리 거래', '값': wins.length },
    { '항목': '손실 거래', '값': losses.length },
    { '항목': '승률 (%)', '값': parseFloat(winRate.toFixed(2)) },
    { '항목': '' },
    { '항목': '=== 손익 ===' },
    { '항목': '총 손익 (USDT)', '값': parseFloat(totalPnl.toFixed(2)) },
    { '항목': '총 수수료 (USDT)', '값': parseFloat(totalFee.toFixed(2)) },
    { '항목': '순 손익 (USDT)', '값': parseFloat((totalPnl - totalFee).toFixed(2)) },
    { '항목': '최대 이익 거래', '값': bestTrade != null ? parseFloat(bestTrade.toFixed(2)) : '' },
    { '항목': '최대 손실 거래', '값': worstTrade != null ? parseFloat(worstTrade.toFixed(2)) : '' },
    { '항목': '평균 이익 (USDT)', '값': avgWin != null ? parseFloat(avgWin.toFixed(2)) : '' },
    { '항목': '평균 손실 (USDT)', '값': avgLoss != null ? parseFloat(avgLoss.toFixed(2)) : '' },
    { '항목': '최대 낙폭 (USDT)', '값': parseFloat(maxDrawdown.toFixed(2)) },
    { '항목': '' },
    { '항목': '=== 고급 지표 ===' },
    { '항목': '평균 손익비', '값': avgPayoff != null ? parseFloat(avgPayoff.toFixed(3)) : '' },
    { '항목': '샤프 비율', '값': sharpe != null ? parseFloat(sharpe.toFixed(4)) : '' },
    { '항목': '소르티노 비율', '값': sortino != null ? parseFloat(sortino.toFixed(4)) : '' },
    { '항목': '평균 손익 (USDT)', '값': parseFloat(mean.toFixed(2)) },
    { '항목': '손익 표준편차', '값': parseFloat(stddev.toFixed(2)) },
    { '항목': '' },
    { '항목': '=== 기준 ===' },
    { '항목': '초기 자산 (USDT)', '값': 7000 },
    { '항목': '총 수익률 (%)', '값': parseFloat(((totalPnl / 7000) * 100).toFixed(2)) },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, '통계요약')

  // ── Sheet 3: 월별 손익 ────────────────────────────────
  const monthMap = new Map<string, { profit: number; trades: number; wins: number; fees: number }>()
  for (const t of sorted) {
    const d = (t.exitTime ?? t.entryTime).toDate()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const prev = monthMap.get(key) ?? { profit: 0, trades: 0, wins: 0, fees: 0 }
    monthMap.set(key, {
      profit: prev.profit + (t.profitLoss ?? 0),
      trades: prev.trades + 1,
      wins: prev.wins + ((t.profitLoss ?? 0) > 0 ? 1 : 0),
      fees: prev.fees + t.fee,
    })
  }
  const monthlyRows = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      '월': month,
      '손익(USDT)': parseFloat(v.profit.toFixed(2)),
      '순손익(USDT)': parseFloat((v.profit - v.fees).toFixed(2)),
      '거래수': v.trades,
      '승리': v.wins,
      '손실': v.trades - v.wins,
      '승률(%)': v.trades ? parseFloat(((v.wins / v.trades) * 100).toFixed(1)) : 0,
      '수수료(USDT)': parseFloat(v.fees.toFixed(2)),
    }))
  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows)
  wsMonthly['!cols'] = [
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
    { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsMonthly, '월별손익')

  // ── Sheet 4: 누적손익 시계열 ──────────────────────────
  let cumPnl = 0
  const cumulRows = sorted
    .filter((t) => t.profitLoss != null)
    .map((t, i) => {
      cumPnl += t.profitLoss ?? 0
      return {
        '번호': i + 1,
        '청산시간': formatTs(t.exitTime ?? t.entryTime),
        '방향': t.direction === 'long' ? '롱' : '숏',
        '손익(USDT)': parseFloat((t.profitLoss ?? 0).toFixed(2)),
        '누적손익(USDT)': parseFloat(cumPnl.toFixed(2)),
        '누적수익률(%)': parseFloat(((cumPnl / 7000) * 100).toFixed(2)),
      }
    })
  const wsCumul = XLSX.utils.json_to_sheet(cumulRows)
  wsCumul['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, wsCumul, '누적손익')

  // ── Sheet 5: 승패 분석 ────────────────────────────────
  const winLossRows = [
    { '구분': '=== 승리 거래 ===' },
    ...wins.sort((a, b) => (b.profitLoss ?? 0) - (a.profitLoss ?? 0)).map((t) => ({
      '구분': '승리',
      '청산시간': formatTs(t.exitTime ?? t.entryTime),
      '방향': t.direction === 'long' ? '롱' : '숏',
      '손익(USDT)': parseFloat((t.profitLoss ?? 0).toFixed(2)),
      'R배수': t.rMultiple != null ? parseFloat(t.rMultiple.toFixed(3)) : '',
      '태그': t.tags.join(' / '),
      '교훈': t.lesson,
    })),
    { '구분': '' },
    { '구분': '=== 손실 거래 ===' },
    ...losses.sort((a, b) => (a.profitLoss ?? 0) - (b.profitLoss ?? 0)).map((t) => ({
      '구분': '손실',
      '청산시간': formatTs(t.exitTime ?? t.entryTime),
      '방향': t.direction === 'long' ? '롱' : '숏',
      '손익(USDT)': parseFloat((t.profitLoss ?? 0).toFixed(2)),
      'R배수': t.rMultiple != null ? parseFloat(t.rMultiple.toFixed(3)) : '',
      '태그': t.tags.join(' / '),
      '교훈': t.lesson,
    })),
  ]
  const wsWinLoss = XLSX.utils.json_to_sheet(winLossRows)
  wsWinLoss['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, wsWinLoss, '승패분석')

  // ── 파일 저장 ─────────────────────────────────────────
  const now = new Date()
  const filename = `매매일지_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
  XLSX.writeFile(wb, filename)
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
          onClick={() => exportToExcel(trades)}
          disabled={trades.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-40 text-green-100 text-xs rounded-xl transition-colors"
        >
          <span>⬇</span>
          <span>Excel 보고서</span>
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
