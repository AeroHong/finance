'use client'

import { Trade } from '@/lib/types'
import { calcMonthlySummary } from '@/lib/firestore'

interface Props {
  trades: Trade[]
  month: string  // "2026년 4월"
}

export default function MonthlySummary({ trades, month }: Props) {
  const s = calcMonthlySummary(trades)

  const profitColor =
    s.totalProfit > 0 ? 'text-green-400' : s.totalProfit < 0 ? 'text-red-400' : 'text-gray-400'

  return (
    <div className="bg-gray-900 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">{month}</span>
        <span className={`text-xl font-bold ${profitColor}`}>
          {s.totalProfit >= 0 ? '+' : ''}
          {s.totalProfit.toFixed(2)} USDT
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-white font-semibold">{s.totalTrades}</div>
          <div className="text-gray-500 text-xs">거래수</div>
        </div>
        <div>
          <div className="text-white font-semibold">{s.winRate.toFixed(0)}%</div>
          <div className="text-gray-500 text-xs">승률</div>
        </div>
        <div>
          <div className="text-green-400 font-semibold">
            {s.winCount}W/{s.lossCount}L
          </div>
          <div className="text-gray-500 text-xs">승/패</div>
        </div>
        <div>
          <div className="text-white font-semibold">
            {s.avgRMultiple >= 0 ? '+' : ''}
            {s.avgRMultiple.toFixed(2)}R
          </div>
          <div className="text-gray-500 text-xs">평균R</div>
        </div>
      </div>
    </div>
  )
}
