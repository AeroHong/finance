'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { User, getIdToken } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  Direction,
  slFromAtr,
  slFromPct,
  pctFromSl,
  atrMultFromSl,
  calcSize,
  calcNotional,
  calcRiskAmount,
  calcMaxSize,
  calcLiqPrice,
  calcRR,
  calcExpectedProfit,
  calcExpectedLoss,
} from '@/lib/calculatorUtils'

interface EntryCalculatorProps {
  currentPrice: number | null
  balance: number | null
  user: User
}

type SlMode = 'atr' | 'pct' | 'price'
type AtrInterval = '5m' | '15m' | '1h' | '4h' | '1d'

function fmt(n: number, decimals = 2): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtBtc(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(4)
}

function fmtPct(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(2) + '%'
}

export default function EntryCalculator({ currentPrice, balance, user }: EntryCalculatorProps) {
  const [direction, setDirection] = useState<Direction>('long')
  const [entryPrice, setEntryPrice] = useState('')
  const [riskPct, setRiskPct] = useState('3')
  const [tp, setTp] = useState('')
  const [leverage, setLeverage] = useState('10')
  const [slMode, setSlMode] = useState<SlMode>('atr')
  const [atrMult, setAtrMult] = useState('1.5')
  const [slPct, setSlPct] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [atrInterval, setAtrInterval] = useState<AtrInterval>('5m')

  const [atr, setAtr] = useState<number | null>(null)
  const [atrLoading, setAtrLoading] = useState(false)
  const [maxLeverageMultiple, setMaxLeverageMultiple] = useState(4.5)

  // 무한루프 방지: SL 재계산 중인지 추적
  const recalcingRef = useRef(false)

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
  }, [user.uid])

  // ATR 조회
  const fetchAtr = useCallback(async (interval: AtrInterval) => {
    setAtrLoading(true)
    try {
      const token = await getIdToken(user)
      const res = await fetch(`/api/binance-atr?interval=${interval}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setAtr(data.atr)
    } catch {
      // 무시
    } finally {
      setAtrLoading(false)
    }
  }, [user])

  // atrInterval 변경 시 자동 조회
  useEffect(() => {
    fetchAtr(atrInterval)
  }, [atrInterval, fetchAtr])

  // SL 3-way 연동: slMode 또는 master 값 변경 시
  useEffect(() => {
    if (recalcingRef.current) return
    const entry = parseFloat(entryPrice)
    if (!isFinite(entry) || entry <= 0) return

    recalcingRef.current = true
    try {
      if (slMode === 'atr') {
        const mult = parseFloat(atrMult)
        if (!isFinite(mult) || !atr) return
        const sl = slFromAtr(entry, atr, mult, direction)
        setSlPrice(sl.toFixed(2))
        setSlPct(pctFromSl(entry, sl, direction).toFixed(3))
      } else if (slMode === 'pct') {
        const pct = parseFloat(slPct)
        if (!isFinite(pct)) return
        const sl = slFromPct(entry, pct, direction)
        setSlPrice(sl.toFixed(2))
        if (atr) setAtrMult(atrMultFromSl(entry, sl, atr, direction).toFixed(2))
      } else {
        const sl = parseFloat(slPrice)
        if (!isFinite(sl)) return
        setSlPct(pctFromSl(entry, sl, direction).toFixed(3))
        if (atr) setAtrMult(atrMultFromSl(entry, sl, atr, direction).toFixed(2))
      }
    } finally {
      recalcingRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPrice, direction, slMode, atrMult, slPct, slPrice, atr])

  function handleDirectionChange(d: Direction) {
    setDirection(d)
    // SL 재계산은 useEffect에서 처리
  }

  // 계산 결과
  const entry = parseFloat(entryPrice)
  const sl = parseFloat(slPrice)
  const tpVal = parseFloat(tp)
  const lev = parseFloat(leverage)
  const riskP = parseFloat(riskPct)
  const cap = balance ?? 0

  const validBase = isFinite(entry) && entry > 0 && isFinite(sl) && sl > 0 && isFinite(lev) && lev > 0 && cap > 0 && isFinite(riskP) && riskP > 0

  const size = validBase ? calcSize(cap, riskP, entry, sl) : NaN
  const notional = validBase ? calcNotional(size, entry) : NaN
  const riskAmount = validBase ? calcRiskAmount(cap, riskP) : NaN
  const maxSize = validBase ? calcMaxSize(cap, maxLeverageMultiple, entry) : NaN
  const liqPrice = validBase ? calcLiqPrice(entry, lev, direction) : NaN
  const hasTP = isFinite(tpVal) && tpVal > 0
  const rr = validBase && hasTP ? calcRR(entry, tpVal, sl) : NaN
  const expectedProfit = validBase && hasTP ? calcExpectedProfit(size, entry, tpVal) : NaN
  const expectedLoss = validBase ? calcExpectedLoss(size, entry, sl) : NaN
  const maxSizePct = isFinite(size) && isFinite(maxSize) && maxSize > 0 ? (size / maxSize) * 100 : NaN

  // 청산가 경고: 롱은 liqPrice < sl 이어야 정상 (청산가가 SL보다 더 아래)
  const liqWarn = validBase && isFinite(liqPrice) && (
    direction === 'long' ? liqPrice > sl : liqPrice < sl
  )

  const INTERVALS: AtrInterval[] = ['5m', '15m', '1h', '4h', '1d']

  return (
    <div className="bg-gray-900 rounded-2xl p-4 space-y-4">
      {/* 방향 */}
      <div className="flex gap-2">
        <button
          onClick={() => handleDirectionChange('long')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            direction === 'long' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          롱 (Long)
        </button>
        <button
          onClick={() => handleDirectionChange('short')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            direction === 'short' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          숏 (Short)
        </button>
      </div>

      {/* 진입가 */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">진입가 (USDT)</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="예: 95000"
            className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          {currentPrice != null && (
            <button
              onClick={() => setEntryPrice(currentPrice.toFixed(2))}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs whitespace-nowrap transition-colors"
            >
              현재가 사용
            </button>
          )}
        </div>
      </div>

      {/* 리스크% / TP / 레버리지 */}
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
          <label className="text-xs text-gray-400 mb-1 block">TP (USDT)</label>
          <input
            type="number"
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            placeholder="선택"
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

      {/* SL 방식 탭 */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">SL 방식</label>
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
          {(['atr', 'pct', 'price'] as SlMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSlMode(m)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                slMode === m ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {m === 'atr' ? 'ATR 배수' : m === 'pct' ? '% 손절' : '직접 입력'}
            </button>
          ))}
        </div>
      </div>

      {/* ATR 타임프레임 (ATR 모드) */}
      {slMode === 'atr' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">ATR 타임프레임</label>
            <button
              onClick={() => fetchAtr(atrInterval)}
              disabled={atrLoading}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 transition-colors"
            >
              {atrLoading ? '조회 중...' : 'ATR 새로고침'}
            </button>
          </div>
          <div className="flex gap-1 flex-wrap mb-2">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => setAtrInterval(iv)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  atrInterval === iv ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
          {atr != null && (
            <div className="text-xs text-gray-500 mb-2">
              ATR({atrInterval}): <span className="text-gray-300">${fmt(atr)}</span>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">ATR 배수</label>
            <input
              type="number"
              value={atrMult}
              onChange={(e) => setAtrMult(e.target.value)}
              step="0.1"
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* SL % 모드 */}
      {slMode === 'pct' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">손절 %</label>
          <input
            type="number"
            value={slPct}
            onChange={(e) => setSlPct(e.target.value)}
            step="0.1"
            placeholder="예: 2.5"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* SL 직접 입력 모드 */}
      {slMode === 'price' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">SL 가격 (USDT)</label>
          <input
            type="number"
            value={slPrice}
            onChange={(e) => setSlPrice(e.target.value)}
            placeholder="예: 92000"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* SL 요약 (읽기전용) */}
      {validBase && (
        <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
          <span>SL: <span className="text-gray-300">${fmt(sl)}</span></span>
          <span>손절: <span className="text-gray-300">{fmtPct(pctFromSl(entry, sl, direction))}</span></span>
          {atr && <span>ATR배수: <span className="text-gray-300">{fmt(atrMultFromSl(entry, sl, atr, direction), 2)}x</span></span>}
        </div>
      )}

      {/* 결과 카드 */}
      {validBase && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">적정 사이즈</span>
            <span className="text-white font-semibold">
              {fmtBtc(size)} BTC <span className="text-gray-500 text-xs">(${fmt(notional)})</span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">리스크금액</span>
            <span className="text-white">
              ${fmt(riskAmount)} <span className="text-gray-500 text-xs">(자본의 {fmtPct(riskP)})</span>
            </span>
          </div>

          <div className="border-t border-gray-700 my-2" />

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">SL</span>
            <span className="text-white">
              ${fmt(sl)}{' '}
              <span className="text-gray-500 text-xs">
                (손절 {fmtPct(pctFromSl(entry, sl, direction))}
                {atr ? ` / ATR ${fmt(atrMultFromSl(entry, sl, atr, direction), 2)}배` : ''})
              </span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">청산가 추정</span>
            <span className="text-white">
              ${fmt(liqPrice)}{' '}
              <span className="text-gray-500 text-xs">*격리마진 근사</span>
            </span>
          </div>

          {liqWarn && (
            <div className="text-red-400 text-xs py-1">
              ⚠️ SL이 청산가보다 불리합니다. 레버리지를 낮추세요.
            </div>
          )}

          <div className="border-t border-gray-700 my-2" />

          {hasTP && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">손익비</span>
                <span className="text-white font-semibold">{fmt(rr, 2)} R</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">예상 수익</span>
                <span className="text-green-400">+${fmt(expectedProfit)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">예상 손실</span>
            <span className="text-red-400">-${fmt(Math.abs(isFinite(expectedLoss) ? expectedLoss : NaN))}</span>
          </div>

          <div className="border-t border-gray-700 my-2" />

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">최대 사이즈</span>
            <span className="text-white">
              {fmtBtc(maxSize)} BTC{' '}
              <span className="text-gray-500 text-xs">
                (현재 {isFinite(maxSizePct) ? maxSizePct.toFixed(1) : '—'}%)
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
