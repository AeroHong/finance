'use client'

import { User } from 'firebase/auth'
import { Trade } from '@/lib/types'
import BalanceCard from '@/components/BalanceCard'
import MonthlySlider from '@/components/MonthlySlider'
import OpenPositions from '@/components/OpenPositions'

interface Props {
  user: User
  allTrades: Trade[] | null
  allTradesLoading: boolean
}

export default function DashboardTab({ user, allTrades, allTradesLoading }: Props) {
  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-6">
      {/* 좌 컬럼 (1/3): BalanceCard + MonthlySlider */}
      <div className="lg:col-span-1">
        <BalanceCard user={user} />
        <MonthlySlider allTrades={allTrades} allTradesLoading={allTradesLoading} />
      </div>

      {/* 우 컬럼 (2/3): 진행 중 포지션 */}
      <div className="lg:col-span-2">
        <OpenPositions user={user} />
      </div>
    </div>
  )
}
