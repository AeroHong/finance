'use client'

import { useState, useEffect } from 'react'
import { User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { StrategyEntry, Strategy, NewStrategy } from '@/lib/types'
import {
  getStrategies,
  saveStrategy,
  deleteStrategy,
} from '@/lib/firestore'

interface EntryCalculatorProps {
  currentPrice: number | null
  balance: number | null
  user: User
}

const RR_PRESETS = ['1.5', '2.0', '2.5', '3.0']

function fmt(n: number, decimals = 2): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtBtc(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(4)
}

export default function EntryCalculator({ currentPrice, balance, user }: EntryCalculatorProps) {
  // 설정
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [riskPct, setRiskPct] = useState('3')
  const [rrRatio, setRrRatio] = useState('2')
  const [leverage, setLeverage] = useState('10')

  // 진입 리스트
  const [entries, setEntries] = useState<StrategyEntry[]>([])

  // 새 진입 입력용
  const [newPrice, setNewPrice] = useState('')
  const [newQty, setNewQty] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  // 저장된 전략
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [showStrategies, setShowStrategies] = useState(false)
  const [strategyName, setStrategyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  // 기타
  const [maxLeverageMultiple, setMaxLeverageMultiple] = useState(4.5)

  // Firestore에서 maxLeverageMultiple 로드
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'settings', 'preferences'))
        if (snap.exists()) {
          const val = snap.data()?.maxLeverageMultiple
          if (typeof val === 'number') setMaxLeverageMultiple(val)
        }
      } catch {
        // 기본값 유지
      }
    }
    load()
    loadStrategies()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid])

  // 계산 (derived values)
  const cap = balance ?? 0
  const riskP = parseFloat(riskPct)
  const rr = parseFloat(rrRatio)
  const lev = parseFloat(leverage)

  const totalQty = entries.reduce((s, e) => s + e.qty, 0)
  const avgEntry = totalQty > 0
    ? entries.reduce((s, e) => s + e.price * e.qty, 0) / totalQty
    : NaN

  const sl = totalQty > 0 && cap > 0 && isFinite(riskP)
    ? (direction === 'long'
        ? avgEntry - (cap * riskP / 100) / totalQty
        : avgEntry + (cap * riskP / 100) / totalQty)
    : NaN

  const tp = isFinite(sl) && isFinite(rr)
    ? (direction === 'long'
        ? avgEntry + rr * (avgEntry - sl)
        : avgEntry - rr * (sl - avgEntry))
    : NaN

  const riskAmount = cap * riskP / 100

  const liqPrice = isFinite(lev) && lev > 0 && isFinite(avgEntry)
    ? (direction === 'long' ? avgEntry * (1 - 1 / lev) : avgEntry * (1 + 1 / lev))
    : NaN

  const maxSize = cap > 0 && isFinite(avgEntry) && avgEntry > 0
    ? (cap * maxLeverageMultiple) / avgEntry
    : NaN

  const executedEntries = entries.filter(e => e.executed)
  const execQty = executedEntries.reduce((s, e) => s + e.qty, 0)
  const execAvg = execQty > 0
    ? executedEntries.reduce((s, e) => s + e.price * e.qty, 0) / execQty
    : NaN
  const execSl = execQty > 0 && cap > 0 && isFinite(riskP)
    ? (direction === 'long'
        ? execAvg - (cap * riskP / 100) / execQty
        : execAvg + (cap * riskP / 100) / execQty)
    : NaN
  const execTp = isFinite(execSl) && isFinite(rr)
    ? (direction === 'long'
        ? execAvg + rr * (execAvg - execSl)
        : execAvg - rr * (execSl - execAvg))
    : NaN

  // 진입 추가/수정/삭제
  function addEntry() {
    const p = parseFloat(newPrice)
    const q = parseFloat(newQty)
    if (!isFinite(p) || p <= 0 || !isFinite(q) || q <= 0) return
    setEntries(prev => [...prev, { id: Date.now().toString(), price: p, qty: q, executed: false }])
    setNewPrice('')
    setNewQty('')
  }

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  function toggleExecuted(id: string) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, executed: !e.executed } : e))
  }

  function startEdit(entry: StrategyEntry) {
    setEditingId(entry.id)
    setNewPrice(entry.price.toString())
    setNewQty(entry.qty.toString())
  }

  function confirmEdit() {
    if (!editingId) return
    const p = parseFloat(newPrice)
    const q = parseFloat(newQty)
    if (!isFinite(p) || p <= 0 || !isFinite(q) || q <= 0) return
    setEntries(prev => prev.map(e => e.id === editingId ? { ...e, price: p, qty: q } : e))
    setEditingId(null)
    setNewPrice('')
    setNewQty('')
  }

  // 전략 저장/불러오기
  async function handleSave() {
    if (entries.length === 0 || !cap) return
    setSaving(true)
    try {
      const name = strategyName.trim() || `BTC ${direction === 'long' ? '롱' : '숏'} ${new Date().toLocaleDateString('ko-KR')}`
      const data: NewStrategy = {
        name,
        direction,
        riskPct: riskP,
        rrRatio: rr,
        leverage: lev,
        entries,
        avgEntry: isFinite(avgEntry) ? avgEntry : 0,
        sl: isFinite(sl) ? sl : 0,
        tp: isFinite(tp) ? tp : 0,
        totalQty,
        status: 'active',
      }
      await saveStrategy(user.uid, data)
      await loadStrategies()
      setStrategyName('')
    } finally {
      setSaving(false)
    }
  }

  async function loadStrategies() {
    setLoading(true)
    try {
      const list = await getStrategies(user.uid)
      setStrategies(list)
    } finally {
      setLoading(false)
    }
  }

  function loadStrategy(s: Strategy) {
    setDirection(s.direction)
    setRiskPct(s.riskPct.toString())
    setRrRatio(s.rrRatio.toString())
    setLeverage(s.leverage.toString())
    setEntries(s.entries)
    setShowStrategies(false)
  }

  async function handleDelete(id: string) {
    await deleteStrategy(user.uid, id)
    await loadStrategies()
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-4 space-y-4">

      {/* 방향 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => setDirection('long')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            direction === 'long' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          롱 (Long)
        </button>
        <button
          onClick={() => setDirection('short')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            direction === 'short' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          숏 (Short)
        </button>
      </div>

      {/* 설정 행: 리스크% / RR / 레버리지 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">리스크 %</label>
          <input
            type="number"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">RR 비율</label>
          <input
            type="number"
            value={rrRatio}
            onChange={(e) => setRrRatio(e.target.value)}
            step="0.1"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">레버리지</label>
          <input
            type="number"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* RR 프리셋 버튼 */}
      <div className="flex gap-1">
        {RR_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setRrRatio(preset)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              rrRatio === preset ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* 진입 리스트 */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
              <span className="text-xs text-gray-500 w-4">#{i + 1}</span>
              <span className="text-sm text-white flex-1">${fmt(e.price)}</span>
              <span className="text-sm text-gray-300">{fmtBtc(e.qty)} BTC</span>
              <button
                onClick={() => toggleExecuted(e.id)}
                className={`text-xs px-2 py-1 rounded-lg ${
                  e.executed ? 'bg-green-700 text-green-200' : 'bg-gray-700 text-gray-400'
                }`}
              >
                {e.executed ? '● 체결' : '○ 계획'}
              </button>
              <button
                onClick={() => startEdit(e)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                수정
              </button>
              <button
                onClick={() => removeEntry(e.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 진입 추가 폼 */}
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="진입가"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />
        {currentPrice != null && (
          <button
            onClick={() => setNewPrice(currentPrice.toFixed(2))}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs whitespace-nowrap transition-colors"
          >
            현재가
          </button>
        )}
        <input
          type="number"
          placeholder="수량(BTC)"
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
          className="w-28 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />
        {editingId ? (
          <>
            <button
              onClick={confirmEdit}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              확인
            </button>
            <button
              onClick={() => { setEditingId(null); setNewPrice(''); setNewQty('') }}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs transition-colors"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={addEntry}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            + 추가
          </button>
        )}
      </div>

      {/* 전략 요약 */}
      {entries.length > 0 && isFinite(sl) && (
        <div className="border-t border-gray-700 pt-4 space-y-3">
          <div className="text-xs text-gray-500 mb-2">전략 요약</div>

          {/* 전체 계획 vs 체결됨만 2컬럼 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 전체 */}
            <div className="space-y-1.5">
              <div className="text-xs text-gray-500 mb-1">전체 계획</div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">평단</span>
                <span className="text-white">${fmt(avgEntry)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">수량</span>
                <span className="text-white">{fmtBtc(totalQty)} BTC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">SL</span>
                <span className="text-red-400">${fmt(sl)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">TP</span>
                <span className="text-green-400">${fmt(tp)}</span>
              </div>
            </div>

            {/* 체결됨만 */}
            {executedEntries.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500 mb-1">체결됨만</div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">평단</span>
                  <span className="text-white">${fmt(execAvg)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">수량</span>
                  <span className="text-white">{fmtBtc(execQty)} BTC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">SL</span>
                  <span className="text-red-400">${fmt(execSl)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">TP</span>
                  <span className="text-green-400">${fmt(execTp)}</span>
                </div>
              </div>
            )}
          </div>

          {/* 리스크/손익비 */}
          <div className="border-t border-gray-700 pt-2 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">리스크금액</span>
              <span className="text-white">
                ${fmt(riskAmount)}{' '}
                <span className="text-gray-500 text-xs">(자본의 {isFinite(riskP) ? riskP.toFixed(1) : '—'}%)</span>
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">손익비</span>
              <span className="text-white">{isFinite(rr) ? rr.toFixed(1) : '—'} R</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">예상 수익</span>
              <span className="text-green-400">
                +${fmt(isFinite(tp) && isFinite(avgEntry) ? totalQty * Math.abs(tp - avgEntry) : NaN)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">예상 손실</span>
              <span className="text-red-400">
                -${fmt(isFinite(sl) && isFinite(avgEntry) ? totalQty * Math.abs(avgEntry - sl) : NaN)}
              </span>
            </div>
            {isFinite(liqPrice) && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">청산가 추정</span>
                <span className="text-white">
                  ${fmt(liqPrice)}{' '}
                  <span className="text-gray-500 text-xs">*격리마진 근사</span>
                </span>
              </div>
            )}
            {isFinite(maxSize) && isFinite(totalQty) && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">최대 사이즈</span>
                <span className="text-white">
                  {fmtBtc(maxSize)} BTC{' '}
                  <span className="text-gray-500 text-xs">
                    ({isFinite(totalQty / maxSize) ? (totalQty / maxSize * 100).toFixed(1) : '—'}% 사용중)
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 전략 저장 영역 */}
      {entries.length > 0 && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <input
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            placeholder={`BTC ${direction === 'long' ? '롱' : '숏'} ${new Date().toLocaleDateString('ko-KR')}`}
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? '저장 중...' : '💾 전략 저장'}
            </button>
            <button
              onClick={() => { setShowStrategies(!showStrategies); if (!showStrategies) loadStrategies() }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors"
            >
              📂 {strategies.length > 0 ? `(${strategies.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* 저장된 전략 목록 패널 */}
      {showStrategies && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="text-xs text-gray-500 mb-2">저장된 전략</div>
          {loading ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : strategies.length === 0 ? (
            <div className="text-sm text-gray-500">저장된 전략 없음</div>
          ) : (
            strategies.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.direction === 'long' ? '롱' : '숏'} · {s.entries.length}개 진입 · SL ${fmt(s.sl)} · TP ${fmt(s.tp)}
                  </div>
                </div>
                <button
                  onClick={() => loadStrategy(s)}
                  className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  불러오기
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  )
}
