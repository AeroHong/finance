'use client'

import { useState, useEffect, useCallback } from 'react'
import { User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BinancePosition, StrategyEntry, Strategy, NewStrategy } from '@/lib/types'
import { Direction, calcMaxSize } from '@/lib/calculatorUtils'
import { getStrategies, saveStrategy, deleteStrategy } from '@/lib/firestore'

interface ScaleInCalculatorProps {
  currentPrice: number | null
  balance: number | null
  openPositions: BinancePosition[]
  user: User
}

function fmt(n: number, decimals = 2): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtBtc(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(4)
}

const RR_PRESETS = ['1.5', '2.0', '2.5', '3.0']

export default function ScaleInCalculator({
  currentPrice,
  balance,
  openPositions,
  user,
}: ScaleInCalculatorProps) {
  // 설정
  const [direction, setDirection] = useState<Direction>('long')
  const [riskPct, setRiskPct] = useState('3')
  const [rrRatio, setRrRatio] = useState('2')
  const [leverage, setLeverage] = useState('10')
  const [tpMode, setTpMode] = useState<'single' | 'split_be'>('split_be')

  // 기존 포지션 (기준점)
  const [basePrice, setBasePrice] = useState('')
  const [baseQty, setBaseQty] = useState('')
  const [baseSl, setBaseSl] = useState('')

  // 추가 진입 리스트
  const [addEntries, setAddEntries] = useState<StrategyEntry[]>([])
  const [newPrice, setNewPrice] = useState('')
  const [newQty, setNewQty] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  // 전략 저장/불러오기
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [showStrategies, setShowStrategies] = useState(false)
  const [strategyName, setStrategyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingStrats, setLoadingStrats] = useState(false)

  // 기타
  const [maxLeverageMultiple, setMaxLeverageMultiple] = useState(4.5)

  // 1. maxLeverageMultiple Firestore 로드
  useEffect(() => {
    getDoc(doc(db, 'users', user.uid, 'settings', 'preferences'))
      .then(snap => {
        if (snap.exists()) {
          const val = snap.data()?.maxLeverageMultiple
          if (typeof val === 'number') setMaxLeverageMultiple(val)
        }
      }).catch(() => {})
  }, [user.uid])

  const fillFromPositions = useCallback(() => {
    const btcPos = openPositions.find(p => p.symbol === 'BTCUSDT')
    if (!btcPos) return
    const amt = parseFloat(btcPos.positionAmt)
    if (amt > 0) {
      setDirection('long')
      setBasePrice(parseFloat(btcPos.entryPrice).toFixed(2))
      setBaseQty(Math.abs(amt).toFixed(4))
    } else if (amt < 0) {
      setDirection('short')
      setBasePrice(parseFloat(btcPos.entryPrice).toFixed(2))
      setBaseQty(Math.abs(amt).toFixed(4))
    }
    // baseSl은 사용자가 직접 입력
  }, [openPositions])

  // 2. 마운트 시 포지션 자동 채우기 (1회)
  useEffect(() => {
    fillFromPositions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 3. openPositions 변경 시 (비어있을 때만 채우기)
  useEffect(() => {
    if (!basePrice && !baseQty) fillFromPositions()
  }, [openPositions, basePrice, baseQty]) // fillFromPositions은 의존성에서 제외해도 됨 (useCallback)

  // ── 계산 로직 (render 중 파생) ──────────────────────────────────
  const cap = balance ?? 0
  const riskP = parseFloat(riskPct)
  const rr = parseFloat(rrRatio)
  const lev = parseFloat(leverage)
  const basePriceVal = parseFloat(basePrice)
  const baseQtyVal = parseFloat(baseQty)
  const baseSlVal = parseFloat(baseSl)

  // 기존 포지션 유효 여부
  const hasBase = isFinite(basePriceVal) && basePriceVal > 0 &&
    isFinite(baseQtyVal) && baseQtyVal > 0

  // 모든 진입 = 기존 + 추가
  const allEntries: Array<{ price: number; qty: number }> = hasBase
    ? [{ price: basePriceVal, qty: baseQtyVal }, ...addEntries]
    : [...addEntries]

  const totalQty = allEntries.reduce((s, e) => s + e.qty, 0)
  const avgEntry = totalQty > 0
    ? allEntries.reduce((s, e) => s + e.price * e.qty, 0) / totalQty
    : NaN

  // 새 SL: 리스크 % 유지
  const newSl = totalQty > 0 && cap > 0 && isFinite(riskP)
    ? (direction === 'long'
        ? avgEntry - (cap * riskP / 100) / totalQty
        : avgEntry + (cap * riskP / 100) / totalQty)
    : NaN

  // SL delta (기존 SL 대비)
  const slDelta = isFinite(newSl) && isFinite(baseSlVal) && baseSlVal > 0
    ? newSl - baseSlVal
    : NaN

  const slDist = isFinite(newSl) && isFinite(avgEntry) ? Math.abs(avgEntry - newSl) : NaN

  // TP: RR 기반 (단일)
  const tp = isFinite(slDist) && isFinite(rr)
    ? (direction === 'long' ? avgEntry + rr * slDist : avgEntry - rr * slDist)
    : NaN

  // 2분할 BE 스탑
  const tp1 = isFinite(slDist) ? (direction === 'long' ? avgEntry + slDist : avgEntry - slDist) : NaN
  const tp2 = tp
  const beStop = isFinite(avgEntry) ? avgEntry : NaN
  const expectedProfitSplit = isFinite(slDist) && isFinite(rr) && isFinite(totalQty)
    ? totalQty * slDist * (0.5 + 0.5 * rr) : NaN
  const avgRrSplit = isFinite(rr) ? 0.5 + 0.5 * rr : NaN

  const riskAmount = isFinite(riskP) && cap > 0 ? cap * riskP / 100 : NaN
  const maxSize = isFinite(avgEntry) && avgEntry > 0 ? calcMaxSize(cap, maxLeverageMultiple, avgEntry) : NaN
  const expectedProfit = isFinite(tp) && isFinite(avgEntry) && isFinite(totalQty)
    ? totalQty * Math.abs(tp - avgEntry) : NaN
  const expectedLoss = isFinite(newSl) && isFinite(avgEntry) && isFinite(totalQty)
    ? totalQty * Math.abs(avgEntry - newSl) : NaN

  // 경고
  const warnSlBreached = addEntries.some(e =>
    direction === 'long' ? e.price <= baseSlVal : e.price >= baseSlVal
  )
  const warnMaxSize = isFinite(totalQty) && isFinite(maxSize) && totalQty > maxSize
  const hasResult = hasBase && totalQty > 0 && isFinite(newSl)

  // ── 진입 추가/수정/삭제 ──────────────────────────────────────────
  function addEntry() {
    const p = parseFloat(newPrice)
    const q = parseFloat(newQty)
    if (!isFinite(p) || p <= 0 || !isFinite(q) || q <= 0) return
    setAddEntries(prev => [...prev, { id: Date.now().toString(), price: p, qty: q, executed: false }])
    setNewPrice('')
    setNewQty('')
  }

  function removeEntry(id: string) {
    setAddEntries(prev => prev.filter(e => e.id !== id))
  }

  function toggleExecuted(id: string) {
    setAddEntries(prev => prev.map(e => e.id === id ? { ...e, executed: !e.executed } : e))
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
    setAddEntries(prev => prev.map(e => e.id === editingId ? { ...e, price: p, qty: q } : e))
    setEditingId(null)
    setNewPrice('')
    setNewQty('')
  }

  // ── 전략 저장/불러오기 ───────────────────────────────────────────
  async function loadStrategies() {
    setLoadingStrats(true)
    try {
      const all = await getStrategies(user.uid)
      setStrategies(all.filter(s => s.strategyType === 'scalein'))
    } finally {
      setLoadingStrats(false)
    }
  }

  async function handleSave() {
    if (!hasBase) return
    setSaving(true)
    try {
      const baseEntry: StrategyEntry = {
        id: 'base',
        price: basePriceVal,
        qty: baseQtyVal,
        executed: true,
      }
      const name = strategyName.trim() ||
        `BTC ${direction === 'long' ? '롱' : '숏'} 분할 ${new Date().toLocaleDateString('ko-KR')}`
      const data: NewStrategy = {
        name,
        direction,
        riskPct: riskP,
        rrRatio: rr,
        leverage: lev,
        entries: [baseEntry, ...addEntries],
        avgEntry: isFinite(avgEntry) ? avgEntry : 0,
        sl: isFinite(newSl) ? newSl : 0,
        tp: isFinite(tp) ? tp : 0,
        totalQty,
        status: 'active',
        strategyType: 'scalein',
        baseSl: isFinite(baseSlVal) ? baseSlVal : undefined,
      }
      await saveStrategy(user.uid, data)
      await loadStrategies()
      setStrategyName('')
    } finally {
      setSaving(false)
    }
  }

  function loadStrategy(s: Strategy) {
    const [base, ...rest] = s.entries
    if (base) {
      setDirection(s.direction)
      setRiskPct(s.riskPct.toString())
      setRrRatio(s.rrRatio.toString())
      setLeverage(s.leverage.toString())
      setBasePrice(base.price.toString())
      setBaseQty(base.qty.toString())
      if (s.baseSl) setBaseSl(s.baseSl.toString())
      setAddEntries(rest)
    }
    setShowStrategies(false)
  }

  async function handleDelete(id: string) {
    await deleteStrategy(user.uid, id)
    await loadStrategies()
  }

  // ── UI ──────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 rounded-2xl p-4 space-y-4">

      {/* 헤더: 포지션 불러오기 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">기존 포지션</span>
        <button onClick={fillFromPositions}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
          🔄 포지션 불러오기
        </button>
      </div>

      {/* 방향 */}
      <div className="flex gap-2">
        <button onClick={() => setDirection('long')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            direction === 'long' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}>롱 (Long)</button>
        <button onClick={() => setDirection('short')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            direction === 'short' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}>숏 (Short)</button>
      </div>

      {/* 기존 포지션 3개 입력 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">기존 평단</label>
          <input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)}
            placeholder="95000"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">기존 수량(BTC)</label>
          <input type="number" value={baseQty} onChange={e => setBaseQty(e.target.value)}
            placeholder="0.01"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">기존 SL</label>
          <input type="number" value={baseSl} onChange={e => setBaseSl(e.target.value)}
            placeholder="92000"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      {/* 설정: 리스크% / RR / 레버리지 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">리스크 %</label>
          <input type="number" value={riskPct} onChange={e => setRiskPct(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400 mb-1 block">RR 비율</label>
          <div className="flex gap-1">
            {RR_PRESETS.map(p => (
              <button key={p} onClick={() => setRrRatio(p)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  rrRatio === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>{p}</button>
            ))}
            <input type="number" value={rrRatio} onChange={e => setRrRatio(e.target.value)}
              step="0.1" placeholder="직접"
              className="w-14 bg-gray-800 text-white rounded-lg px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* 익절 방식 */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">익절 방식</label>
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
          <button
            onClick={() => setTpMode('single')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tpMode === 'single' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            단일 TP
          </button>
          <button
            onClick={() => setTpMode('split_be')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tpMode === 'split_be' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            2분할 BE 스탑 ★
          </button>
        </div>
        {tpMode === 'split_be' && isFinite(avgRrSplit) && (
          <div className="text-xs text-gray-500 mt-1">
            평균 RR <span className="text-blue-400">{avgRrSplit.toFixed(2)} R</span>
            <span className="ml-2">(TP1 1R × 50% + TP2 {isFinite(rr) ? rr.toFixed(1) : '—'}R × 50%)</span>
          </div>
        )}
      </div>

      {/* 추가 진입 리스트 */}
      {addEntries.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">추가 진입 계획</div>
          {addEntries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
              <span className="text-xs text-gray-500 w-4">+{i + 1}</span>
              <span className="text-sm text-white flex-1">${fmt(e.price)}</span>
              <span className="text-sm text-gray-300">{fmtBtc(e.qty)} BTC</span>
              <button onClick={() => toggleExecuted(e.id)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                  e.executed ? 'bg-green-700 text-green-200' : 'bg-gray-700 text-gray-400'
                }`}>
                {e.executed ? '● 체결' : '○ 계획'}
              </button>
              <button onClick={() => startEdit(e)} className="text-xs text-blue-400 hover:text-blue-300">수정</button>
              <button onClick={() => removeEntry(e.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 추가 진입 입력 폼 */}
      <div className="border-t border-gray-700 pt-3">
        <div className="text-xs text-gray-500 mb-2">추가 진입 추가</div>
        <div className="flex gap-2">
          <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)}
            placeholder="진입가"
            className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
          {currentPrice != null && (
            <button onClick={() => setNewPrice(currentPrice.toFixed(2))}
              className="px-2 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs whitespace-nowrap transition-colors">
              현재가
            </button>
          )}
          <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)}
            placeholder="수량(BTC)"
            className="w-28 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
          {editingId ? (
            <>
              <button onClick={confirmEdit}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs transition-colors">확인</button>
              <button onClick={() => { setEditingId(null); setNewPrice(''); setNewQty('') }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs transition-colors">취소</button>
            </>
          ) : (
            <button onClick={addEntry}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors">+ 추가</button>
          )}
        </div>
      </div>

      {/* 경고 */}
      {warnSlBreached && (
        <div className="text-red-400 text-xs">⚠️ 추가 진입가 중 기존 SL 이하인 항목이 있습니다</div>
      )}
      {warnMaxSize && (
        <div className="text-yellow-400 text-xs">⚠️ 자본 한도를 초과합니다</div>
      )}

      {/* 전략 요약 */}
      {hasResult && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="text-xs text-gray-500 mb-1">전략 요약</div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">새 평단</span>
            <span className="text-white font-semibold">${fmt(avgEntry)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">총 수량</span>
            <span className="text-white">{fmtBtc(totalQty)} BTC</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">새 SL</span>
            <span className="text-white">
              ${fmt(newSl)}{' '}
              {isFinite(slDelta) && (
                <span className={`text-xs ${slDelta > 0 ? 'text-green-400' : slDelta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  ({slDelta > 0 ? '+' : ''}{fmt(slDelta)} {slDelta > 0 ? '↑' : '↓'})
                </span>
              )}
            </span>
          </div>
          {tpMode === 'single' ? (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">TP</span>
              <span className="text-green-400">${fmt(tp)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">TP1 <span className="text-gray-600">(50%)</span></span>
                <span className="text-green-400">${fmt(tp1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">TP2 <span className="text-gray-600">(50%)</span></span>
                <span className="text-green-400">${fmt(tp2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">BE 스탑</span>
                <span className="text-yellow-400">${fmt(beStop)}</span>
              </div>
            </>
          )}

          <div className="border-t border-gray-700 pt-2 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">손익비</span>
              <span className="text-white">
                {tpMode === 'split_be' && isFinite(avgRrSplit)
                  ? <>{avgRrSplit.toFixed(2)} R <span className="text-gray-500 text-xs">(평균)</span></>
                  : isFinite(rr) ? `${rr.toFixed(1)} R` : '—'
                }
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">예상 수익</span>
              <span className="text-green-400">+${fmt(tpMode === 'split_be' ? expectedProfitSplit : expectedProfit)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">예상 손실</span>
              <span className="text-red-400">-${fmt(expectedLoss)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">리스크금액</span>
              <span className="text-white">${fmt(riskAmount)} <span className="text-gray-500 text-xs">(자본의 {isFinite(riskP) ? riskP.toFixed(1) : '—'}%)</span></span>
            </div>
            {isFinite(maxSize) && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">최대 사이즈</span>
                <span className="text-white">{fmtBtc(maxSize)} BTC <span className="text-gray-500 text-xs">({isFinite(totalQty / maxSize) ? (totalQty / maxSize * 100).toFixed(1) : '—'}% 사용중)</span></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 전략 저장 영역 */}
      {hasBase && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <input value={strategyName} onChange={e => setStrategyName(e.target.value)}
            placeholder={`BTC ${direction === 'long' ? '롱' : '숏'} 분할 ${new Date().toLocaleDateString('ko-KR')}`}
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
              {saving ? '저장 중...' : '💾 전략 저장'}
            </button>
            <button onClick={() => { setShowStrategies(!showStrategies); if (!showStrategies) loadStrategies() }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">
              📂 {strategies.length > 0 ? `(${strategies.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* 저장된 전략 목록 */}
      {showStrategies && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="text-xs text-gray-500 mb-2">저장된 분할 진입 전략</div>
          {loadingStrats ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : strategies.length === 0 ? (
            <div className="text-sm text-gray-500">저장된 전략 없음</div>
          ) : (
            strategies.map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.direction === 'long' ? '롱' : '숏'} · 진입 {s.entries.length}개 · SL ${fmt(s.sl)} · TP ${fmt(s.tp)}
                  </div>
                </div>
                <button onClick={() => loadStrategy(s)}
                  className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors">
                  불러오기
                </button>
                <button onClick={() => handleDelete(s.id)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors">✕</button>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  )
}
