'use client'

import { useEffect, useState, useCallback } from 'react'
import { User, getIdToken } from 'firebase/auth'

const INITIAL_CAPITAL = 7000

interface Balance {
  balance: number
  crossUnPnl: number
  availableBalance: number
}

export default function BalanceCard({ user }: { user: User }) {
  const [data, setData] = useState<Balance | null>(null)
  const [error, setError] = useState(false)

  const fetch_ = useCallback(async () => {
    try {
      const token = await getIdToken(user)
      const res = await fetch('/api/balance', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      setData(await res.json())
      setError(false)
    } catch {
      setError(true)
    }
  }, [user])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, 30000)
    return () => clearInterval(id)
  }, [fetch_])

  if (error || !data) return null

  const total = data.balance + data.crossUnPnl
  const pnl = total - INITIAL_CAPITAL
  const pnlPct = (pnl / INITIAL_CAPITAL) * 100
  const isPos = pnl >= 0

  return (
    <div className="bg-gray-900 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">💰 평가자산</span>
        <span className="text-xs text-gray-600">초기 {INITIAL_CAPITAL.toLocaleString()} USDT 대비</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-sm text-gray-400 ml-1">USDT</span>
          </div>
          <div className={`text-sm font-semibold mt-0.5 ${isPos ? 'text-green-400' : 'text-red-400'}`}>
            {isPos ? '+' : ''}{pnl.toFixed(2)} USDT ({isPos ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-1">
          <div>지갑 {data.balance.toFixed(2)}</div>
          <div className={data.crossUnPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
            미실현 {data.crossUnPnl >= 0 ? '+' : ''}{data.crossUnPnl.toFixed(2)}
          </div>
          <div>가용 {data.availableBalance.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}
