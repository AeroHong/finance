'use client'

import { useEffect, useState, useCallback } from 'react'
import { User, getIdToken } from 'firebase/auth'
import { BinancePosition } from '@/lib/types'

interface MarketDataBarProps {
  user: User
  onPriceUpdate: (price: number) => void
  onBalanceUpdate: (balance: number) => void
  onPositionsUpdate: (positions: BinancePosition[]) => void
}

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 8)
}

export default function MarketDataBar({
  user,
  onPriceUpdate,
  onBalanceUpdate,
  onPositionsUpdate,
}: MarketDataBarProps) {
  const [price, setPrice] = useState<number | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [posCount, setPosCount] = useState<number>(0)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT')
      if (!res.ok) return
      const data = await res.json()
      const p = parseFloat(data.price)
      setPrice(p)
      onPriceUpdate(p)
      setLastUpdate(new Date())
    } catch {
      // 무시
    }
  }, [onPriceUpdate])

  const fetchAccountData = useCallback(async () => {
    try {
      const token = await getIdToken(user)

      const [balRes, posRes] = await Promise.all([
        fetch('/api/balance', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/positions', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (balRes.ok) {
        const balData = await balRes.json()
        const b = balData.balance ?? 0
        setBalance(b)
        onBalanceUpdate(b)
      }

      if (posRes.ok) {
        const posData = await posRes.json()
        const positions: BinancePosition[] = posData.positions ?? []
        setPosCount(positions.length)
        onPositionsUpdate(positions)
      }
    } catch {
      // 무시
    }
  }, [user, onBalanceUpdate, onPositionsUpdate])

  useEffect(() => {
    fetchPrice()
    fetchAccountData()

    const priceId = setInterval(fetchPrice, 10000)
    const accountId = setInterval(fetchAccountData, 30000)

    return () => {
      clearInterval(priceId)
      clearInterval(accountId)
    }
  }, [fetchPrice, fetchAccountData])

  return (
    <div className="flex items-center gap-4 text-sm bg-gray-900 rounded-xl px-4 py-2 mb-4 flex-wrap">
      <span className="text-gray-400">
        BTC{' '}
        <span className="text-white font-semibold">
          {price != null ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
        </span>
      </span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-400">
        잔고{' '}
        <span className="text-white font-semibold">
          {balance != null ? `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
        </span>
      </span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-400">
        포지션 <span className="text-white font-semibold">{posCount}개</span>
      </span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-500 text-xs">
        갱신 {lastUpdate ? formatTime(lastUpdate) : '—'}
      </span>
    </div>
  )
}
