'use client'

import { useState, useMemo } from 'react'
import { Trade } from '@/lib/types'
import { calcMonthlySummary } from '@/lib/firestore'

interface Props {
  allTrades: Trade[] | null
  allTradesLoading: boolean
}

function formatMonthLabel(key: string): string {
  // "2026-04" → "2026년 4월"
  const [year, month] = key.split('-')
  return `${year}년 ${parseInt(month)}월`
}

export default function MonthlySlider({ allTrades, allTradesLoading }: Props) {
  const [monthIndex, setMonthIndex] = useState(0)

  // closed 거래의 entryTime 기준으로 "YYYY-MM" 목록 추출 (내림차순)
  const months = useMemo(() => {
    if (!allTrades) return []
    const closed = allTrades.filter((t) => t.status === 'closed')
    const set = new Set<string>()
    for (const t of closed) {
      const d = t.entryTime.toDate()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      set.add(key)
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [allTrades])

  // 현재 월 거래 필터링
  const currentMonthTrades = useMemo(() => {
    if (!allTrades || months.length === 0) return []
    const key = months[monthIndex]
    return allTrades.filter((t) => {
      if (t.status !== 'closed') return false
      const d = t.entryTime.toDate()
      const tradeKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return tradeKey === key
    })
  }, [allTrades, months, monthIndex])

  const summary = useMemo(() => {
    if (currentMonthTrades.length === 0) return null
    return calcMonthlySummary(currentMonthTrades)
  }, [currentMonthTrades])

  if (allTradesLoading) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 mb-4 animate-pulse">
        <div className="h-5 bg-gray-800 rounded w-32 mb-3" />
        <div className="h-8 bg-gray-800 rounded w-48 mb-3" />
        <div className="h-px bg-gray-800 mb-3" />
        <div className="grid grid-cols-5 gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const safeIndex = Math.min(Math.max(monthIndex, 0), Math.max(months.length - 1, 0))
  const currentKey = months[safeIndex] ?? null
  const profitColor =
    summary && summary.totalProfit > 0
      ? 'text-green-400'
      : summary && summary.totalProfit < 0
      ? 'text-red-400'
      : 'text-gray-400'

  return (
    <div className="bg-gray-900 rounded-2xl p-4 mb-4">
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setMonthIndex((i) => i + 1)}
          disabled={monthIndex >= months.length - 1}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1"
          aria-label="이전 월"
        >
          ←
        </button>
        <span className="text-gray-300 text-sm font-medium">
          {currentKey ? formatMonthLabel(currentKey) : '—'}
        </span>
        <button
          onClick={() => setMonthIndex((i) => i - 1)}
          disabled={monthIndex <= 0}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1"
          aria-label="다음 월"
        >
          →
        </button>
      </div>

      {!summary ? (
        <div className="text-center py-4 text-gray-600 text-sm">
          {months.length === 0 ? '거래 기록이 없습니다' : '이 달의 거래가 없습니다'}
        </div>
      ) : (
        <>
          {/* 총수익 */}
          <div className={`text-xl font-bold mb-3 ${profitColor}`}>
            {summary.totalProfit >= 0 ? '+' : ''}
            {summary.totalProfit.toFixed(2)} USDT
          </div>

          <div className="border-t border-gray-800 pt-3">
            <div className="grid grid-cols-5 gap-1 text-center">
              <div>
                <div className="text-white font-semibold text-sm">{summary.totalTrades}</div>
                <div className="text-gray-500 text-xs">거래수</div>
              </div>
              <div>
                <div className="text-white font-semibold text-sm">{summary.winRate.toFixed(0)}%</div>
                <div className="text-gray-500 text-xs">승률</div>
              </div>
              <div>
                <div className="text-green-400 font-semibold text-sm">
                  {summary.winCount}W/{summary.lossCount}L
                </div>
                <div className="text-gray-500 text-xs">승/패</div>
              </div>
              <div>
                <div className="text-white font-semibold text-sm">
                  {summary.avgRMultiple != null
                    ? `${summary.avgRMultiple >= 0 ? '+' : ''}${summary.avgRMultiple.toFixed(2)}R`
                    : 'N/A'}
                </div>
                <div className="text-gray-500 text-xs">평균R</div>
              </div>
              <div>
                <div className="text-white font-semibold text-sm">
                  {summary.avgPayoffRatio != null
                    ? summary.avgPayoffRatio.toFixed(2)
                    : 'N/A'}
                </div>
                <div className="text-gray-500 text-xs">손익비</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
