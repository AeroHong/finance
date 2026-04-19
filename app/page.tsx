'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getIdToken } from 'firebase/auth'
import { useAuth } from '@/app/providers'
import { getTrades, addTrade, updateTrade } from '@/lib/firestore'
import { Trade, NewTrade } from '@/lib/types'
import TradeCard from '@/components/TradeCard'
import TradeForm from '@/components/TradeForm'
import MonthlySummary from '@/components/MonthlySummary'
import OpenPositions from '@/components/OpenPositions'
import BalanceCard from '@/components/BalanceCard'

const ALLOWED_UID = process.env.NEXT_PUBLIC_ALLOWED_UID

export default function Home() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [trades, setTrades] = useState<Trade[]>([])
  const [fetching, setFetching] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editTrade, setEditTrade] = useState<Trade | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  const loadTrades = useCallback(async () => {
    if (!user) return
    setFetching(true)
    try {
      const data = await getTrades(user.uid)
      setTrades(data)
    } finally {
      setFetching(false)
    }
  }, [user])

  useEffect(() => {
    if (user) loadTrades()
  }, [user, loadTrades])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    )
  }
  if (!user) return null

  if (ALLOWED_UID && user.uid !== ALLOWED_UID) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-full max-w-sm mx-4 p-8 bg-gray-900 rounded-2xl text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-white font-bold text-lg mb-2">접근 권한 없음</h2>
          <button onClick={logout} className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  const now = new Date()
  const thisMonthTrades = trades.filter((t) => {
    const d = t.entryTime.toDate()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`

  async function handleSync(full = false) {
    if (!user) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const token = await getIdToken(user)
      const res = await fetch('/api/sync-binance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const msg = data.saved > 0
        ? `${data.saved}건 동기화 완료`
        : '새 거래 없음'
      setSyncMsg(data.errors?.length ? `${msg} (일부 오류)` : msg)
      await loadTrades()
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : '동기화 실패')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }

  async function handleSave(trade: NewTrade) {
    if (!user) return
    if (editTrade) {
      await updateTrade(user.uid, editTrade.id, trade)
    } else {
      await addTrade(user.uid, trade)
    }
    await loadTrades()
  }

  function openEdit(trade: Trade) {
    setEditTrade(trade)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTrade(null)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <span className="font-semibold">BTC 매매일지</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            title="최근 거래 동기화"
            className="text-sm text-gray-400 hover:text-white disabled:text-gray-600 transition-colors"
          >
            {syncing ? '⏳' : '🔄'}
          </button>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white transition-colors">
            로그아웃
          </button>
        </div>
      </header>

      {/* 동기화 메시지 토스트 */}
      {syncMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-30">
          {syncMsg}
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        {/* 평가자산 */}
        <BalanceCard user={user} />

        {/* 이번 달 요약 */}
        <MonthlySummary trades={thisMonthTrades} month={monthLabel} />

        {/* 실시간 진행 중 포지션 */}
        <OpenPositions user={user} />

        {/* 최근 거래 목록 */}
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
                  onClick={() => handleSync(true)}
                  disabled={syncing}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white text-sm rounded-xl transition-colors"
                >
                  {syncing ? '불러오는 중...' : '바이낸스에서 전체 불러오기 (90일)'}
                </button>
                <p className="text-xs text-gray-600">또는 아래 + 버튼으로 직접 추가</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {trades.map((t) => (
                <TradeCard key={t.id} trade={t} onClick={() => openEdit(t)} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => { setEditTrade(null); setShowForm(true) }}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-2xl rounded-full shadow-lg flex items-center justify-center transition-colors z-20"
      >
        +
      </button>

      {/* 거래 입력 폼 */}
      {showForm && (
        <TradeForm
          initial={editTrade ?? undefined}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}
    </div>
  )
}
