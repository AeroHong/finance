import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']
const SEVEN_DAYS = 7 * 24 * 3600 * 1000

function sign(query: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex')
}

interface BinanceTrade {
  symbol: string
  orderId: number
  side: string
  positionSide: string
  price: string
  qty: string
  realizedPnl: string
  commission: string
  time: number
  maker: boolean
}

interface BinanceIncome {
  symbol: string
  incomeType: string
  income: string
  asset: string
  time: number
  tranId: number
}

// Binance 7일 제한 → 구간 분할 페이지네이션
async function fetchAllTrades(symbol: string, fromMs: number, toMs: number): Promise<BinanceTrade[]> {
  const apiKey = process.env.BINANCE_API_KEY!
  const apiSecret = process.env.BINANCE_API_SECRET!
  const all: BinanceTrade[] = []

  let cursor = fromMs
  while (cursor < toMs) {
    const end = Math.min(cursor + SEVEN_DAYS, toMs)
    const timestamp = Date.now()
    const params = new URLSearchParams({
      symbol,
      startTime: String(cursor),
      endTime: String(end),
      limit: '1000',
      timestamp: String(timestamp),
    })
    const signature = sign(params.toString(), apiSecret)
    const url = `https://fapi.binance.com/fapi/v1/userTrades?${params}&signature=${signature}`

    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } })
    if (!res.ok) {
      const errText = await res.text()
      // 거래 없는 심볼은 400 에러 → 건너뜀
      if (res.status === 400) break
      throw new Error(`Binance [${symbol}] ${res.status}: ${errText}`)
    }
    const batch: BinanceTrade[] = await res.json()
    all.push(...batch)
    cursor = end + 1

    // Rate limit 방지
    if (batch.length === 1000) await sleep(200)
  }

  return all
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// 펀딩피 조회 (FUNDING_FEE)
async function fetchFundingFees(fromMs: number, toMs: number): Promise<BinanceIncome[]> {
  const apiKey = process.env.BINANCE_API_KEY!
  const apiSecret = process.env.BINANCE_API_SECRET!
  const all: BinanceIncome[] = []

  let cursor = fromMs
  while (cursor < toMs) {
    const end = Math.min(cursor + SEVEN_DAYS, toMs)
    const timestamp = Date.now()
    const params = new URLSearchParams({
      incomeType: 'FUNDING_FEE',
      startTime: String(cursor),
      endTime: String(end),
      limit: '1000',
      timestamp: String(timestamp),
    })
    const signature = sign(params.toString(), apiSecret)
    const url = `https://fapi.binance.com/fapi/v1/income?${params}&signature=${signature}`

    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } })
    if (!res.ok) {
      const errText = await res.text()
      if (res.status === 400) break
      throw new Error(`Binance income ${res.status}: ${errText}`)
    }
    const batch: BinanceIncome[] = await res.json()
    all.push(...batch)
    cursor = end + 1

    if (batch.length === 1000) await sleep(200)
  }

  return all
}

// positionSide 기반 direction 판단
// 청산 fill 기준이므로 BOTH 모드에서 방향 반전 (SELL=롱 청산, BUY=숏 청산)
function getDirection(trade: BinanceTrade): 'long' | 'short' {
  if (trade.positionSide === 'LONG') return 'long'
  if (trade.positionSide === 'SHORT') return 'short'
  // BOTH(단방향 모드): 청산 fill은 진입 방향의 반대
  return trade.side === 'SELL' ? 'long' : 'short'
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid
    const allowedUid = process.env.NEXT_PUBLIC_ALLOWED_UID
    if (allowedUid && uid !== allowedUid) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const isFull = body.full === true
    const daysBack = isFull ? 90 : 7

    const settingsRef = adminDb.doc(`users/${uid}/settings/binanceSync`)
    const settingsSnap = await settingsRef.get()
    const lastSyncTime: number = settingsSnap.exists
      ? (settingsSnap.data()?.lastSyncTime ?? 0)
      : 0

    const toMs = Date.now()
    const fromMs = isFull
      ? toMs - daysBack * 24 * 3600 * 1000
      : (lastSyncTime || toMs - daysBack * 24 * 3600 * 1000)

    let totalSaved = 0
    let latestTime = lastSyncTime
    const errors: string[] = []

    // 펀딩피 데이터 수집
    let fundingFees: BinanceIncome[] = []
    try {
      fundingFees = await fetchFundingFees(fromMs, toMs)
    } catch (e) {
      errors.push(`펀딩피 조회 실패: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 심볼별 펀딩피 총액 계산
    const fundingBySymbol = new Map<string, number>()
    for (const f of fundingFees) {
      const current = fundingBySymbol.get(f.symbol) || 0
      fundingBySymbol.set(f.symbol, current + parseFloat(f.income))
    }

    for (const symbol of SYMBOLS) {
      let raw: BinanceTrade[]
      try {
        raw = await fetchAllTrades(symbol, fromMs, toMs)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
        continue
      }
      if (!raw.length) continue

      const tradesRef = adminDb.collection(`users/${uid}/trades`)
      const orderIds = [...new Set(raw.map((t) => String(t.orderId)))]

      // 중복 체크 (30개씩)
      const existingIds = new Set<string>()
      for (let i = 0; i < orderIds.length; i += 30) {
        const chunk = orderIds.slice(i, i + 30)
        const snap = await tradesRef
          .where('binanceOrderId', 'in', chunk)
          .select('binanceOrderId')
          .get()
        snap.docs.forEach((d) => existingIds.add(d.data().binanceOrderId))
      }

      // orderId별 그룹핑
      const orderMap = new Map<string, BinanceTrade[]>()
      for (const t of raw) {
        const key = String(t.orderId)
        if (!orderMap.has(key)) orderMap.set(key, [])
        orderMap.get(key)!.push(t)
      }

      let batch = adminDb.batch()
      let batchCount = 0

      // 심볼별 거래 건수 계산 (펀딩피 배분용)
      const validTrades = Array.from(orderMap.entries()).filter(
        ([orderId, fills]) => !existingIds.has(orderId) && fills.reduce((s, f) => s + parseFloat(f.realizedPnl), 0) !== 0
      )
      const tradeCount = validTrades.length
      const fundingPerTrade = tradeCount > 0 ? (fundingBySymbol.get(symbol) || 0) / tradeCount : 0

      for (const [orderId, fills] of orderMap) {
        if (existingIds.has(orderId)) continue

        const first = fills[0]
        const totalQty = fills.reduce((s, f) => s + parseFloat(f.qty), 0)
        const avgPrice =
          fills.reduce((s, f) => s + parseFloat(f.price) * parseFloat(f.qty), 0) / totalQty
        const totalPnl = fills.reduce((s, f) => s + parseFloat(f.realizedPnl), 0)
        const totalFee = fills.reduce((s, f) => s + parseFloat(f.commission), 0)

        // PnL=0인 진입 fill은 저장하지 않음 (청산 fill만 저장)
        if (totalPnl === 0) continue

        const direction = getDirection(first)
        const tradeTime = first.time

        batch.set(tradesRef.doc(), {
          symbol: first.symbol,
          direction,
          entryPrice: avgPrice,
          exitPrice: null,
          quantity: totalQty,
          leverage: 0,
          profitLoss: totalPnl !== 0 ? totalPnl : null,
          profitPct: null,
          fee: totalFee,
          fundingFee: fundingPerTrade,
          entryTime: Timestamp.fromMillis(tradeTime),
          exitTime: null,
          durationHours: null,
          status: 'closed',
          stopLoss: null,
          takeProfit: null,
          rMultiple: null,
          entryType: '',
          entryReason: '',
          exitReason: '',
          notes: '',
          lesson: '',
          tags: [],
          screenshots: [],
          geminiAnalysis: '',
          geminiTags: [],
          isManual: false,
          binanceOrderId: orderId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        if (tradeTime > latestTime) latestTime = tradeTime
        batchCount++
        totalSaved++

        if (batchCount >= 400) {
          await batch.commit()
          batch = adminDb.batch()
          batchCount = 0
        }
      }

      if (batchCount > 0) await batch.commit()
    }

    if (latestTime > lastSyncTime) {
      await settingsRef.set({ lastSyncTime: latestTime + 1 }, { merge: true })
    }

    return NextResponse.json({
      success: true,
      saved: totalSaved,
      errors: errors.length ? errors : undefined,
    })
  } catch (err) {
    console.error('sync-binance error:', err)
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
