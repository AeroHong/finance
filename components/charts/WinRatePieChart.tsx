'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Trade } from '@/lib/types'

interface Props {
  allTrades: Trade[]
}

function calcWinLoss(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === 'closed' && t.profitLoss != null)
  const wins = closed.filter((t) => (t.profitLoss ?? 0) > 0).length
  const losses = closed.length - wins
  return { wins, losses, total: closed.length }
}

interface CenterLabelProps {
  cx: number
  cy: number
  winRate: number
}

function CenterLabel({ cx, cy, winRate }: CenterLabelProps) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-8" fill="#f9fafb" fontSize={20} fontWeight="bold">
        {winRate.toFixed(0)}%
      </tspan>
      <tspan x={cx} dy="20" fill="#9ca3af" fontSize={11}>
        승률
      </tspan>
    </text>
  )
}

export default function WinRatePieChart({ allTrades }: Props) {
  const [mode, setMode] = useState<'all' | 'month'>('all')

  const now = new Date()
  const trades =
    mode === 'month'
      ? allTrades.filter((t) => {
          const d = t.entryTime.toDate()
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth()
          )
        })
      : allTrades

  const { wins, losses, total } = calcWinLoss(trades)
  const winRate = total ? (wins / total) * 100 : 0

  const chartData = [
    { name: '승', value: wins },
    { name: '패', value: losses },
  ]

  return (
    <div>
      {/* 토글 */}
      <div className="flex gap-1 mb-2">
        {(['all', 'month'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-2 py-1 rounded-lg transition-colors ${
              mode === m
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {m === 'all' ? '전체' : '이번 달'}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center h-[160px] text-gray-600 text-sm">
          데이터 없음
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={75}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                <Cell fill="#22c55e" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#f9fafb',
                }}
                itemStyle={{ color: '#f9fafb' }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value, name) => [
                  `${Number(value)}회`,
                  String(name),
                ] as [string, string]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* SVG 오버레이로 중앙 텍스트 표시 */}
          <div className="relative -mt-[160px] h-[160px] flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-white text-xl font-bold">{winRate.toFixed(0)}%</div>
              <div className="text-gray-400 text-xs">승률</div>
              <div className="text-gray-500 text-xs mt-0.5">
                {wins}승 {losses}패
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
