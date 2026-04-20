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
} from 'recharts'
import { RBucket } from '@/lib/chartUtils'

interface Props {
  data: RBucket[]
}

export default function RMultipleChart({ data }: Props) {
  const hasData = data.some((b) => b.count > 0)

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">
        손절가 입력 시 표시됩니다
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          width={32}
          allowDecimals={false}
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
          formatter={(value) => [`${Number(value)}건`, '거래수'] as [string, string]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isPositive ? '#22c55e' : '#ef4444'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
