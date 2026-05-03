'use client'

import { useState } from 'react'
import { User } from 'firebase/auth'
import { BinancePosition } from '@/lib/types'
import MarketDataBar from '@/components/calculator/MarketDataBar'
import EntryCalculator from '@/components/calculator/EntryCalculator'
import ScaleInCalculator from '@/components/calculator/ScaleInCalculator'

interface CalculatorTabProps {
  user: User
}

type Section = '신규 진입' | '분할 진입'

const SECTIONS: Section[] = ['신규 진입', '분할 진입']

export default function CalculatorTab({ user }: CalculatorTabProps) {
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [positions, setPositions] = useState<BinancePosition[]>([])
  const [section, setSection] = useState<Section>('신규 진입')

  return (
    <div>
      <h1 className="text-lg font-bold text-white mb-4">🧮 계산기</h1>

      <MarketDataBar
        user={user}
        onPriceUpdate={setBtcPrice}
        onBalanceUpdate={setBalance}
        onPositionsUpdate={setPositions}
      />

      {/* 섹션 탭 */}
      <div className="flex bg-gray-900 rounded-xl p-1 gap-1 mb-4">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === s
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* 내용 */}
      {section === '신규 진입' && (
        <EntryCalculator
          currentPrice={btcPrice}
          balance={balance}
          user={user}
        />
      )}
      {section === '분할 진입' && (
        <ScaleInCalculator
          currentPrice={btcPrice}
          balance={balance}
          openPositions={positions}
          user={user}
        />
      )}
    </div>
  )
}
