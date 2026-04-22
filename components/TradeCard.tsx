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

const ENTRY_TYPE_LABELS: Record<string, string> = {
  event_driven: '이벤트',
  technical: '기술적',
  algorithm: '알고리즘',
  mixed: '복합',
}

export default function TradeCard({ trade, onClick }: Props) {
  const isLong = trade.direction === 'long'
  const isWin = (trade.profitLoss ?? 0) > 0

  const pnlColor = isWin ? 'text-green-400' : 'text-red-400'
  const dirBg = isLong ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'

  // Binance 동기화 거래: entryTime = 청산 시간, entryPrice = 청산 평단가
  const closeTime = trade.exitTime ?? trade.entryTime

  const hasJournal = !!(trade.entryReason || trade.lesson || trade.notes)

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
          {trade.entryType && (
            <span className="text-xs bg-blue-900/40 text-blue-400 px-2 py-0.5 rounded-full">
              {ENTRY_TYPE_LABELS[trade.entryType] ?? trade.entryType}
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
        <span>평단가 {formatPrice(trade.entryPrice)}</span>
        {trade.quantity > 0 && (
          <span>{trade.quantity.toFixed(4)} BTC</span>
        )}
        <span>청산 {formatTime(closeTime)}</span>
        {trade.rMultiple != null && (
          <span className={`ml-auto font-semibold ${trade.rMultiple >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R
          </span>
        )}
      </div>

      {/* 일지 기록 영역 */}
      {hasJournal && (
        <div className="mt-2 space-y-1">
          {trade.entryReason && (
            <div className="text-xs text-gray-400 line-clamp-1">
              💡 {trade.entryReason}
            </div>
          )}
          {trade.lesson && (
            <div className="text-xs text-indigo-400 line-clamp-1">
              ✏️ {trade.lesson}
            </div>
          )}
          {!trade.entryReason && trade.notes && (
            <div className="text-xs text-gray-500 line-clamp-1">
              {trade.notes}
            </div>
          )}
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
