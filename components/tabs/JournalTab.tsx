'use client'

import { Trade } from '@/lib/types'
import TradeCard from '@/components/TradeCard'

interface Props {
  trades: Trade[]
  fetching: boolean
  syncMsg: string | null
  onSync: () => void
  onOpenEdit: (trade: Trade) => void
}

export default function JournalTab({
  trades,
  fetching,
  syncMsg,
  onSync,
  onOpenEdit,
}: Props) {
  return (
    <div>
      <h2 className="text-gray-400 text-sm font-semibold mb-2">
        최근 거래
        {fetching && <span className="ml-2 text-xs text-gray-600">불러오는 중...</span>}
      </h2>
      {trades.length === 0 && !fetching ? (
        <div className="text-center py-12 text-gray-600">
          <div className="text-4xl mb-3">📭</div>
          <p>거래 기록이 없습니다</p>
          <div className="flex flex-col gap-2 mt-4 items-center">
            <button
              onClick={onSync}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded-xl transition-colors"
            >
              바이낸스에서 전체 불러오기 (90일)
            </button>
            <p className="text-xs text-gray-600">또는 아래 + 버튼으로 직접 추가</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => (
            <TradeCard key={t.id} trade={t} onClick={() => onOpenEdit(t)} />
          ))}
        </div>
      )}
    </div>
  )
}
