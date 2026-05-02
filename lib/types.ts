import { Timestamp } from 'firebase/firestore'

export interface Trade {
  id: string

  // 바이낸스 자동 수집
  symbol: string             // "BTCUSDT"
  direction: 'long' | 'short'
  entryPrice: number
  exitPrice: number | null   // 진행 중이면 null
  quantity: number           // BTC 수량
  leverage: number
  profitLoss: number | null  // USDT 손익
  profitPct: number | null   // 수익률 %
  fee: number
  fundingFee: number         // 펀딩피 (USDT)
  entryTime: Timestamp
  exitTime: Timestamp | null
  durationHours: number | null
  status: 'open' | 'closed'

  // 계산 필드
  stopLoss: number | null
  takeProfit: number | null
  rMultiple: number | null

  // 수동 입력
  entryReason: string
  exitReason: string
  entryType: 'event_driven' | 'technical' | 'algorithm' | 'mixed' | ''
  notes: string
  lesson: string
  tags: string[]
  screenshots: string[]

  // AI 분석
  geminiAnalysis: string
  geminiTags: string[]

  // 메타
  isManual: boolean
  binanceOrderId: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type NewTrade = Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>

export interface MarketEvent {
  id: string
  date: Timestamp
  title: string
  description: string
  impact: 'bullish' | 'bearish' | 'neutral'
  tags: string[]
  relatedTrades: string[]
}

export interface MonthlySummary {
  id: string  // "2026-04"
  totalProfit: number
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number
  avgRMultiple: number | null
  avgPayoffRatio: number | null
  bestTrade: number
  worstTrade: number
  totalFee: number
  totalFundingFee: number
  updatedAt: Timestamp
}
