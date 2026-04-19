'use client'

import { Trade } from '@/lib/types'
import { Timestamp } from 'firebase/firestore'

interface Props {
  trade: Trade
  onClick: () => void
}

function formatPrice(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatTime(ts: Timestamp | null) {
  if (!ts) return '-'
  const d = ts.toDate()
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TradeCard({ trade, onClick }: Props) {
  const isLong = trade.direction === 'long'
  const isWin = (trade.profitLoss ?? 0) > 0
  const isOpen = trade.status === 'open'

  const pnlColor = isOpen
    ? 'text-yellow-400'
    : isWin
    ? 'text-green-400'
    : 'text-red-400'

  const dirBg = isLong ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'

  return (
    <button
      onClick={onClick}
      className="w-full bg-gray-900 rounded-xl p-4 text-left hover:bg-gray-800 transition-colors active:bg-gray-700"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dirBg}`}>
            {isLong ? '롱' : '숏'}
          </span>
          <span className="text-white font-semibold">
            {trade.symbol.replace('USDT', '')}
          </span>
          {trade.leverage > 0 && (
            <span className="text-gray-500 text-xs">{trade.leverage}x</span>
          )}
          {isOpen && (
            <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded-full">
              진행 중
            </span>
          )}
        </div>
        <div className={`text-right ${pnlColor}`}>
          <div className="font-bold">
            {trade.profitLoss != null
              ? `${trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}`
              : '-'}{' '}
            <span className="text-xs">USDT</span>
          </div>
          {trade.profitPct != null && (
            <div className="text-xs">
              {trade.profitPct >= 0 ? '+' : ''}
              {trade.profitPct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
        <span>진입 {formatPrice(trade.entryPrice)}</span>
        {trade.exitPrice && <span>청산 {formatPrice(trade.exitPrice)}</span>}
        <span>{formatTime(trade.entryTime)}</span>
        {trade.durationHours != null && (
          <span>{trade.durationHours.toFixed(1)}h</span>
        )}
      </div>

      {trade.entryReason && (
        <div className="mt-2 text-xs text-gray-400 line-clamp-1">
          {trade.entryReason}
        </div>
      )}

      {trade.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {trade.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
