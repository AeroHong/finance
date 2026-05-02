import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Trade, NewTrade, MonthlySummary } from '@/lib/types'

function tradesCol(uid: string) {
  return collection(db, 'users', uid, 'trades')
}

function summaryCol(uid: string) {
  return collection(db, 'users', uid, 'summary')
}

// ── 거래 목록 조회 (최신순) ──────────────────────────────────
export async function getTrades(uid: string, count = 50): Promise<Trade[]> {
  const q = query(tradesCol(uid), orderBy('entryTime', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trade))
}

// ── 단일 거래 조회 ────────────────────────────────────────────
export async function getTrade(uid: string, tradeId: string): Promise<Trade | null> {
  const snap = await getDoc(doc(tradesCol(uid), tradeId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Trade
}

// ── 거래 추가 ─────────────────────────────────────────────────
export async function addTrade(uid: string, trade: NewTrade): Promise<string> {
  const ref = await addDoc(tradesCol(uid), {
    ...trade,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

// ── 거래 수정 ─────────────────────────────────────────────────
export async function updateTrade(
  uid: string,
  tradeId: string,
  updates: Partial<Trade>
): Promise<void> {
  await updateDoc(doc(tradesCol(uid), tradeId), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

// ── 거래 삭제 ─────────────────────────────────────────────────
export async function deleteTrade(uid: string, tradeId: string): Promise<void> {
  await deleteDoc(doc(tradesCol(uid), tradeId))
}

// ── 월별 통계 ─────────────────────────────────────────────────
export async function getMonthlySummary(
  uid: string,
  month: string  // "2026-04"
): Promise<MonthlySummary | null> {
  const snap = await getDoc(doc(summaryCol(uid), month))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as MonthlySummary
}

// ── 월별 통계 계산 (클라이언트 사이드) ───────────────────────
export function calcMonthlySummary(trades: Trade[]): Omit<MonthlySummary, 'id' | 'updatedAt'> {
  const closed = trades.filter((t) => t.status === 'closed' && t.profitLoss != null)
  const wins = closed.filter((t) => (t.profitLoss ?? 0) > 0)
  const losses = closed.filter((t) => (t.profitLoss ?? 0) < 0)
  const totalProfit = closed.reduce((s, t) => s + (t.profitLoss ?? 0), 0)
  const pnls = closed.map((t) => t.profitLoss ?? 0)

  const withR = closed.filter((t) => t.rMultiple != null)
  const avgRMultiple = withR.length
    ? withR.reduce((s, t) => s + t.rMultiple!, 0) / withR.length
    : null

  const avgWin = wins.length ? wins.reduce((s, t) => s + t.profitLoss!, 0) / wins.length : null
  const avgLossAbs = losses.length
    ? Math.abs(losses.reduce((s, t) => s + t.profitLoss!, 0) / losses.length)
    : null
  const avgPayoffRatio =
    avgWin != null && avgLossAbs != null && avgLossAbs > 0
      ? avgWin / avgLossAbs
      : null

  return {
    totalProfit,
    totalTrades: closed.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    avgRMultiple,
    avgPayoffRatio,
    bestTrade: pnls.length ? Math.max(...pnls) : 0,
    worstTrade: pnls.length ? Math.min(...pnls) : 0,
    totalFee: trades.reduce((s, t) => s + (t.fee ?? 0), 0),
    totalFundingFee: trades.reduce((s, t) => s + (t.fundingFee ?? 0), 0),
  }
}

// ── 전체 거래 목록 (차트용, 오름차순) ─────────────────────────
export async function getAllTrades(uid: string): Promise<Trade[]> {
  const q = query(tradesCol(uid), orderBy('entryTime', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trade))
}

// ── 이번 달 거래 목록 ─────────────────────────────────────────
export async function getThisMonthTrades(uid: string): Promise<Trade[]> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const q = query(
    tradesCol(uid),
    where('entryTime', '>=', Timestamp.fromDate(start)),
    orderBy('entryTime', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trade))
}
