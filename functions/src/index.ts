import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import axios from 'axios'
import * as crypto from 'crypto'

admin.initializeApp()
const db = admin.firestore()

// ── Binance API 서명 생성 ──────────────────────────────────────
function sign(query: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(query).digest('hex')
}

// ── Binance API 요청 헬퍼 ─────────────────────────────────────
async function binanceGet(path: string, params: Record<string, string | number> = {}) {
  const apiKey = process.env.BINANCE_API_KEY
  const apiSecret = process.env.BINANCE_API_SECRET
  if (!apiKey || !apiSecret) throw new Error('Binance API 키 없음')

  const timestamp = Date.now()
  const queryObj = { ...params, timestamp }
  const query = new URLSearchParams(
    Object.entries(queryObj).map(([k, v]) => [k, String(v)])
  ).toString()
  const signature = sign(query, apiSecret)

  const url = `https://fapi.binance.com${path}?${query}&signature=${signature}`
  const res = await axios.get(url, {
    headers: { 'X-MBX-APIKEY': apiKey },
    timeout: 10000,
  })
  return res.data
}

// ── 거래 내역 → Firestore 저장 ────────────────────────────────
async function syncTrades(uid: string) {
  // 마지막 동기화 시간 확인
  const settingsRef = db.doc(`users/${uid}/settings/binanceSync`)
  const settingsSnap = await settingsRef.get()
  const lastSyncTime: number = settingsSnap.exists
    ? (settingsSnap.data()?.lastSyncTime ?? 0)
    : 0

  // 바이낸스에서 거래 내역 조회 (최근 7일, 최대 1000건)
  const startTime = lastSyncTime || Date.now() - 7 * 24 * 3600 * 1000
  const rawTrades: BinanceTrade[] = await binanceGet('/fapi/v1/userTrades', {
    symbol: 'BTCUSDT',
    startTime,
    limit: 1000,
  })

  if (!rawTrades.length) {
    console.log('새 거래 없음')
    return 0
  }

  // 이미 저장된 orderId 목록
  const tradesRef = db.collection(`users/${uid}/trades`)
  const existingSnap = await tradesRef
    .where('binanceOrderId', 'in',
      rawTrades.slice(0, 30).map((t: BinanceTrade) => String(t.orderId))
    )
    .get()
  const existingIds = new Set(existingSnap.docs.map((d) => d.data().binanceOrderId))

  // 포지션별로 그룹핑 (같은 orderId = 같은 거래)
  const orderMap = new Map<string, BinanceTrade[]>()
  for (const trade of rawTrades) {
    const key = String(trade.orderId)
    if (!orderMap.has(key)) orderMap.set(key, [])
    orderMap.get(key)!.push(trade)
  }

  let saved = 0
  const batch = db.batch()

  for (const [orderId, fills] of orderMap) {
    if (existingIds.has(orderId)) continue

    const first = fills[0]
    const totalQty = fills.reduce((s, f) => s + parseFloat(f.qty), 0)
    const avgPrice = fills.reduce((s, f) => s + parseFloat(f.price) * parseFloat(f.qty), 0) / totalQty
    const totalPnl = fills.reduce((s, f) => s + parseFloat(f.realizedPnl), 0)
    const totalFee = fills.reduce((s, f) => s + parseFloat(f.commission), 0)

    const direction = first.side === 'BUY' ? 'long' : 'short'
    const entryTime = admin.firestore.Timestamp.fromMillis(first.time)

    const newDoc = tradesRef.doc()
    batch.set(newDoc, {
      symbol: first.symbol,
      direction,
      entryPrice: avgPrice,
      exitPrice: null,
      quantity: totalQty,
      leverage: 0,  // 별도 조회 필요
      profitLoss: totalPnl !== 0 ? totalPnl : null,
      profitPct: null,
      fee: totalFee,
      entryTime,
      exitTime: null,
      durationHours: null,
      status: totalPnl !== 0 ? 'closed' : 'open',
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    saved++
  }

  await batch.commit()

  // 마지막 동기화 시간 갱신
  const lastTradeTime = Math.max(...rawTrades.map((t: BinanceTrade) => t.time))
  await settingsRef.set({ lastSyncTime: lastTradeTime + 1 }, { merge: true })

  console.log(`${saved}건 저장 완료`)
  return saved
}

interface BinanceTrade {
  symbol: string
  orderId: number
  side: string
  price: string
  qty: string
  realizedPnl: string
  commission: string
  time: number
}

// ── Cloud Scheduler: 5분마다 실행 ────────────────────────────
export const syncBinanceTrades = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Seoul',
    secrets: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
  },
  async () => {
    const uid = process.env.ALLOWED_UID
    if (!uid) {
      console.error('ALLOWED_UID 환경변수 없음')
      return
    }
    try {
      const count = await syncTrades(uid)
      console.log(`동기화 완료: ${count}건`)
    } catch (err) {
      console.error('Binance 동기화 실패:', err)
    }
  }
)

// ── 수동 동기화 트리거 (클라이언트 호출용) ───────────────────
export const manualSyncTrades = onCall(
  {
    secrets: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인 필요')

    const uid = request.auth.uid
    const allowedUid = process.env.ALLOWED_UID
    if (allowedUid && uid !== allowedUid) {
      throw new HttpsError('permission-denied', '권한 없음')
    }

    try {
      const count = await syncTrades(uid)
      return { success: true, count }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      throw new HttpsError('internal', msg)
    }
  }
)
