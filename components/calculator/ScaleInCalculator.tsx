'use client'

import { useState, useEffect, useCallback } from 'react'
import { User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BinancePosition } from '@/lib/types'
import {
  Direction,
  calcNewAvgEntry,
  calcNewSl,
  calcSlDelta,
  calcMaxSize,
  calcRiskAmount,
} from '@/lib/calculatorUtils'

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

export default function ScaleInCalculator({
  currentPrice,
  balance,
  openPositions,
  user,
}: ScaleInCalculatorProps) {
  const [direction, setDirection] = useState<Direction>('long')
  const [existingEntry, setExistingEntry] = useState('')
  const [existingQty, setExistingQty] = useState('')
  const [existingSl, setExistingSl] = useState('')
  const [addEntry, setAddEntry] = useState('')
  const [addMode, setAddMode] = useState<'manual' | 'risk'>('manual')
  const [addQty, setAddQty] = useState('')
  const [addRiskPct, setAddRiskPct] = useState('3')
  const [riskPct, setRiskPct] = useState('3')
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
  }, [user.uid])

  const fillFromPositions = useCallback(() => {
    const btcPos = openPositions.find((p) => p.symbol === 'BTCUSDT')
    if (!btcPos) return
    const amt = parseFloat(btcPos.positionAmt)
    if (amt > 0) {
      setDirection('long')
      setExistingEntry(btcPos.entryPrice)
      setExistingQty(Math.abs(amt).toString())
    } else if (amt < 0) {
      setDirection('short')
      setExistingEntry(btcPos.entryPrice)
      setExistingQty(Math.abs(amt).toString())
    }
    // existingSl은 사용자가 직접 입력
  }, [openPositions])

  // 마운트 시 자동 채우기
  useEffect(() => {
    fillFromPositions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 마운트 시 1회만

  // openPositions 변경 시 업데이트 (단, 사용자가 수정한 경우 덮어쓰지 않도록 빈 경우만)
  useEffect(() => {
    if (!existingEntry && !existingQty) {
      fillFromPositions()
    }
  }, [openPositions, existingEntry, existingQty, fillFromPositions])

  const cap = balance ?? 0
  const existEntry = parseFloat(existingEntry)
  const existQty = parseFloat(existingQty)
  const existSl = parseFloat(existingSl)
  const addEntryVal = parseFloat(addEntry)
  const riskP = parseFloat(riskPct)
  const addRiskP = parseFloat(addRiskPct)

  // addQty 계산 (risk 모드)
  let addQtyVal: number
  if (addMode === 'risk') {
    // 추가 리스크금액 / |addEntry - existSl|
    const riskAmt = calcRiskAmount(cap, addRiskP)
    const slDiff = Math.abs(addEntryVal - existSl)
    addQtyVal = isFinite(slDiff) && slDiff > 0 ? riskAmt / slDiff : NaN
  } else {
    addQtyVal = parseFloat(addQty)
  }

  const validBase =
    isFinite(existEntry) && existEntry > 0 &&
    isFinite(existQty) && existQty > 0 &&
    isFinite(existSl) && existSl > 0 &&
    isFinite(addEntryVal) && addEntryVal > 0 &&
    isFinite(addQtyVal) && addQtyVal > 0 &&
    cap > 0 && isFinite(riskP) && riskP > 0

  const newAvgEntry = validBase ? calcNewAvgEntry(existQty, existEntry, addQtyVal, addEntryVal) : NaN
  const totalQty = validBase ? existQty + addQtyVal : NaN
  const newSl = validBase ? calcNewSl(newAvgEntry, totalQty, cap, riskP, direction) : NaN
  const slDelta = validBase && isFinite(existSl) ? calcSlDelta(newSl, existSl) : NaN
  const maxSize = isFinite(addEntryVal) && addEntryVal > 0 ? calcMaxSize(cap, maxLeverageMultiple, addEntryVal) : NaN
  const totalRiskAmt = validBase ? calcRiskAmount(cap, riskP) : NaN

  // 경고
  const warnSl = validBase && isFinite(addEntryVal) && isFinite(existSl) && (
    direction === 'long' ? addEntryVal <= existSl : addEntryVal >= existSl
  )
  const warnMaxSize = validBase && isFinite(totalQty) && isFinite(maxSize) && totalQty > maxSize

  return (
    <div className="bg-gray-900 rounded-2xl p-4 space-y-4">
      {/* 포지션 불러오기 버튼 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">기존 포지션</span>
        <button
          onClick={fillFromPositions}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors"
        >
          포지션 불러오기
        </button>
      </div>

      {/* 방향 */}
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

      {/* 기존 포지션 정보 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">기존 진입가</label>
          <input
            type="number"
            value={existingEntry}
            onChange={(e) => setExistingEntry(e.target.value)}
            placeholder="예: 95000"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">기존 수량 (BTC)</label>
          <input
            type="number"
            value={existingQty}
            onChange={(e) => setExistingQty(e.target.value)}
            placeholder="예: 0.01"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">기존 SL</label>
          <input
            type="number"
            value={existingSl}
            onChange={(e) => setExistingSl(e.target.value)}
            placeholder="예: 92000"
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 추가 진입 */}
      <div className="border-t border-gray-700 pt-4">
        <label className="text-xs text-gray-400 mb-2 block">추가 진입</label>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={addEntry}
            onChange={(e) => setAddEntry(e.target.value)}
            placeholder={currentPrice != null ? `현재가: ${currentPrice.toFixed(2)}` : '추가 진입가'}
            className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          {currentPrice != null && (
            <button
              onClick={() => setAddEntry(currentPrice.toFixed(2))}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-xs whitespace-nowrap transition-colors"
            >
              현재가
            </button>
          )}
        </div>

        {/* 추가 수량 방식 */}
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1 mb-3">
          <button
            onClick={() => setAddMode('manual')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              addMode === 'manual' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            수량 직접 입력
          </button>
          <button
            onClick={() => setAddMode('risk')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              addMode === 'risk' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            리스크 기반
          </button>
        </div>

        {addMode === 'manual' ? (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">추가 수량 (BTC)</label>
            <input
              type="number"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              placeholder="예: 0.005"
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ) : (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">추가 리스크 %</label>
            <input
              type="number"
              value={addRiskPct}
              onChange={(e) => setAddRiskPct(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
            {isFinite(addQtyVal) && (
              <div className="text-xs text-gray-500 mt-1">
                계산 수량: <span className="text-gray-300">{fmtBtc(addQtyVal)} BTC</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 총 리스크 기준 */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">목표 총 리스크 % (새 SL 계산 기준)</label>
        <input
          type="number"
          value={riskPct}
          onChange={(e) => setRiskPct(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 경고 */}
      {warnSl && (
        <div className="text-red-400 text-xs py-1">
          ⚠️ 추가 진입가가 SL 이하입니다
        </div>
      )}
      {warnMaxSize && (
        <div className="text-yellow-400 text-xs py-1">
          ⚠️ 자본 한도를 초과합니다
        </div>
      )}

      {/* 결과 카드 */}
      {validBase && (
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">새 평단</span>
            <span className="text-white font-semibold">${fmt(newAvgEntry)}</span>
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
                  ({slDelta > 0 ? '+' : ''}{fmt(slDelta)} {slDelta > 0 ? '↑' : slDelta < 0 ? '↓' : ''})
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">총 리스크금액</span>
            <span className="text-white">
              ${fmt(totalRiskAmt)}{' '}
              <span className="text-gray-500 text-xs">(자본의 {riskP.toFixed(1)}%)</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
