'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getIdToken } from 'firebase/auth'
import { useAuth } from '@/app/providers'
import { getTrades, getAllTrades, addTrade, updateTrade } from '@/lib/firestore'
import { Trade, NewTrade } from '@/lib/types'
import TradeForm from '@/components/TradeForm'
import DashboardTab from '@/components/tabs/DashboardTab'
import JournalTab from '@/components/tabs/JournalTab'
import StatsTab from '@/components/tabs/StatsTab'

const ALLOWED_UID = process.env.NEXT_PUBLIC_ALLOWED_UID

type TabId = 'dashboard' | 'journal' | 'stats'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'dashboard', label: '대시보드', icon: '🏠' },
  { id: 'journal',   label: '일지',     icon: '📋' },
  { id: 'stats',     label: '통계',     icon: '📊' },
]

export default function Home() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  const [tab, setTab] = useState<TabId>('dashboard')
  const [trades, setTrades] = useState<Trade[]>([])
  const [fetching, setFetching] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editTrade, setEditTrade] = useState<Trade | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // 통계/대시보드용 전체 거래 (한 번만 로드)
  const [allTrades, setAllTrades] = useState<Trade[] | null>(null)
  const [allTradesLoading, setAllTradesLoading] = useState(false)

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

  // 통계/대시보드 탭 전환 시 allTrades 로드 (중복 호출 방지)
  useEffect(() => {
    if ((tab === 'stats' || tab === 'dashboard') && user && allTrades === null && !allTradesLoading) {
      setAllTradesLoading(true)
      getAllTrades(user.uid)
        .then(setAllTrades)
        .finally(() => setAllTradesLoading(false))
    }
  }, [tab, user, allTrades, allTradesLoading])

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
          <button
            onClick={logout}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>
    )
  }

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
      const msg = data.saved > 0 ? `${data.saved}건 동기화 완료` : '새 거래 없음'
      setSyncMsg(data.errors?.length ? `${msg} (일부 오류)` : msg)
      await loadTrades()
      // allTrades 캐시 무효화 → 다음 통계/대시보드 탭 진입 시 재로드
      setAllTrades(null)
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
    setAllTrades(null) // 캐시 무효화
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
      {/* ── 데스크탑 사이드바 ── */}
      <aside className="hidden lg:flex lg:fixed lg:left-0 lg:top-0 lg:h-full lg:w-56 flex-col bg-gray-900 border-r border-gray-800 z-20">
        {/* 로고 */}
        <div className="px-5 py-5 border-b border-gray-800 flex items-center gap-2">
          <span className="text-xl">📊</span>
          <span className="font-semibold text-sm">BTC 매매일지</span>
        </div>

        {/* 탭 */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {/* 하단 액션 */}
        <div className="px-3 pb-5 space-y-1 border-t border-gray-800 pt-4">
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            <span>{syncing ? '⏳' : '🔄'}</span>
            <span>{syncing ? '동기화 중...' : '동기화'}</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* ── 모바일 헤더 ── */}
      <header className="lg:hidden border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-10">
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
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* ── 동기화 토스트 ── */}
      {syncMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-30">
          {syncMsg}
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <main className="lg:pl-56 px-4 py-4 pb-24 lg:pb-8 lg:px-8 lg:py-8">
        {tab === 'dashboard' && (
          <DashboardTab
            user={user}
            allTrades={allTrades}
            allTradesLoading={allTradesLoading}
          />
        )}
        {tab === 'journal' && (
          <JournalTab
            trades={trades}
            fetching={fetching}
            syncMsg={syncMsg}
            onSync={() => handleSync(true)}
            onOpenEdit={openEdit}
          />
        )}
        {tab === 'stats' && (
          <StatsTab
            trades={allTrades ?? []}
            loading={allTradesLoading}
          />
        )}
      </main>

      {/* ── 모바일 하단 탭 바 ── */}
      <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-gray-900 border-t border-gray-800 z-20 flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors ${
              tab === t.id ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── FAB (일지 탭에서만 표시) ── */}
      {tab === 'journal' && (
        <button
          onClick={() => { setEditTrade(null); setShowForm(true) }}
          className="fixed bottom-20 right-6 lg:bottom-8 lg:right-8 w-14 h-14 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-2xl rounded-full shadow-lg flex items-center justify-center transition-colors z-20"
        >
          +
        </button>
      )}

      {/* ── 거래 입력 폼 ── */}
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
