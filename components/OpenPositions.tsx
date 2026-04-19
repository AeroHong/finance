'use client'

import { useEffect, useState, useCallback } from 'react'
import { User } from 'firebase/auth'
import { getIdToken } from 'firebase/auth'

interface BinancePosition {
  symbol: string
  positionAmt: string
  entryPrice: string
  markPrice: string
  unRealizedProfit: string
  leverage: string
  positionSide: string
}

interface Props {
  user: User
}

function formatPrice(s: string) {
  const n = parseFloat(s)
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function OpenPositions({ user }: Props) {
  const [positions, setPositions] = useState<BinancePosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPositions = useCallback(async () => {
    try {
      const token = await getIdToken(user)
      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPositions(data.positions)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchPositions()
    // 30초마다 갱신
    const id = setInterval(fetchPositions, 30000)
    return () => clearInterval(id)
  }, [fetchPositions])

  if (loading || (positions.length === 0 && !error)) return null

  if (error) return null  // 에러 시 섹션 숨김

  return (
    <div className="mb-4">
      <h2 className="text-yellow-400 text-sm font-semibold mb-2">
        ⚡ 진행 중 ({positions.length})
      </h2>
      <div className="space-y-2">
        {positions.map((p) => {
          const amt = parseFloat(p.positionAmt)
          const isLong = amt > 0
          const pnl = parseFloat(p.unRealizedProfit)
          const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'
          const entry = parseFloat(p.entryPrice)
          const mark = parseFloat(p.markPrice)
          const pnlPct = entry > 0 ? ((mark - entry) / entry) * (isLong ? 1 : -1) * parseFloat(p.leverage) * 100 : 0

          return (
            <div
              key={`${p.symbol}-${p.positionSide}`}
              className="bg-gray-900 rounded-xl p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isLong ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {isLong ? '롱' : '숏'}
                  </span>
                  <span className="text-white font-semibold">
                    {p.symbol.replace('USDT', '')}
                  </span>
                  <span className="text-gray-500 text-xs">{p.leverage}x</span>
                </div>
                <div className={`text-right ${pnlColor}`}>
                  <div className="font-bold">
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} <span className="text-xs">USDT</span>
                  </div>
                  <div className="text-xs">
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span>진입 {formatPrice(p.entryPrice)}</span>
                <span>현재 {formatPrice(p.markPrice)}</span>
                <span>수량 {Math.abs(amt)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
