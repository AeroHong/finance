'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { CumulativePoint } from '@/lib/chartUtils'

interface Props {
  data: CumulativePoint[]
}

export default function CumulativePnlChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">
        거래 데이터가 없습니다
      </div>
    )
  }

  const lastVal = data[data.length - 1]?.cumulative ?? 0
  const lineColor = lastVal >= 0 ? '#22c55e' : '#ef4444'

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          interval="preserveStartEnd"
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
            return [`${v >= 0 ? '+' : ''}${v.toFixed(2)} USDT`, '누적 손익'] as [string, string]
          }}
        />
        <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 2" />
        <Line
          type="monotone"
          dataKey="cumulative"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
