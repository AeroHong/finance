'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts'
import { MonthlyBar } from '@/lib/chartUtils'

interface Props {
  data: MonthlyBar[]
}

function formatMonth(key: string) {
  // "2026-04" → "4월"
  const parts = key.split('-')
  return `${parseInt(parts[1])}월`
}

export default function MonthlyPnlChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">
        거래 데이터가 없습니다
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          width={56}
          tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
        />
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
          formatter={(value) => {
            const v = Number(value)
            return [`${v >= 0 ? '+' : ''}${v.toFixed(2)} USDT`, '손익'] as [string, string]
          }}
          labelFormatter={(label) => formatMonth(String(label))}
        />
        <ReferenceLine y={0} stroke="#6b7280" />
        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
