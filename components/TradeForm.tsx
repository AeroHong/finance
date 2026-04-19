'use client'

import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Trade, NewTrade } from '@/lib/types'

const PRESET_TAGS = [
  '이란', 'FOMC', '매크로', '이벤트드리븐',
  'MACD', '지지선', '돌파', '아래꼬리',
  '추세추종', '손절', '익절', '재진입',
]

const ENTRY_TYPES = [
  { value: 'event_driven', label: '이벤트' },
  { value: 'technical', label: '기술적' },
  { value: 'algorithm', label: '알고리즘' },
  { value: 'mixed', label: '복합' },
] as const

interface Props {
  initial?: Partial<Trade>
  onSave: (trade: NewTrade) => Promise<void>
  onClose: () => void
}

export default function TradeForm({ initial, onSave, onClose }: Props) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    symbol: initial?.symbol ?? 'BTCUSDT',
    direction: initial?.direction ?? 'long' as 'long' | 'short',
    entryPrice: initial?.entryPrice?.toString() ?? '',
    exitPrice: initial?.exitPrice?.toString() ?? '',
    quantity: initial?.quantity?.toString() ?? '',
    leverage: initial?.leverage?.toString() ?? '10',
    fee: initial?.fee?.toString() ?? '0',
    stopLoss: initial?.stopLoss?.toString() ?? '',
    takeProfit: initial?.takeProfit?.toString() ?? '',
    status: initial?.status ?? 'closed' as 'open' | 'closed',
    entryType: initial?.entryType ?? '' as Trade['entryType'],
    entryReason: initial?.entryReason ?? '',
    exitReason: initial?.exitReason ?? '',
    notes: initial?.notes ?? '',
    lesson: initial?.lesson ?? '',
    tags: initial?.tags ?? [] as string[],
    entryDate: initial?.entryTime
      ? initial.entryTime.toDate().toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    exitDate: initial?.exitTime
      ? initial.exitTime.toDate().toISOString().slice(0, 16)
      : '',
  })

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleTag(tag: string) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }))
  }

  function calcPnL() {
    const entry = parseFloat(form.entryPrice)
    const exit = parseFloat(form.exitPrice)
    const qty = parseFloat(form.quantity)
    const lev = parseFloat(form.leverage) || 1
    if (!entry || !exit || !qty) return null
    const raw = form.direction === 'long' ? (exit - entry) * qty : (entry - exit) * qty
    return raw * lev
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const entry = parseFloat(form.entryPrice)
      const exit = form.exitPrice ? parseFloat(form.exitPrice) : null
      const qty = parseFloat(form.quantity) || 0
      const lev = parseFloat(form.leverage) || 1
      const pnl = calcPnL()
      const pnlPct = pnl != null && entry ? (pnl / (entry * qty)) * 100 : null

      const entryTs = Timestamp.fromDate(new Date(form.entryDate))
      const exitTs = form.exitDate ? Timestamp.fromDate(new Date(form.exitDate)) : null
      const durationHours =
        exitTs && entryTs
          ? (exitTs.toMillis() - entryTs.toMillis()) / 3600000
          : null

      const stopLoss = form.stopLoss ? parseFloat(form.stopLoss) : null
      const takeProfit = form.takeProfit ? parseFloat(form.takeProfit) : null
      let rMultiple: number | null = null
      if (pnl != null && stopLoss && entry) {
        const risk = Math.abs(entry - stopLoss) * qty * lev
        rMultiple = risk > 0 ? pnl / risk : null
      }

      const trade: NewTrade = {
        symbol: form.symbol.toUpperCase(),
        direction: form.direction,
        entryPrice: entry,
        exitPrice: exit,
        quantity: qty,
        leverage: lev,
        profitLoss: pnl,
        profitPct: pnlPct,
        fee: parseFloat(form.fee) || 0,
        entryTime: entryTs,
        exitTime: exitTs,
        durationHours,
        status: form.status,
        stopLoss,
        takeProfit,
        rMultiple,
        entryType: form.entryType,
        entryReason: form.entryReason,
        exitReason: form.exitReason,
        notes: form.notes,
        lesson: form.lesson,
        tags: form.tags,
        screenshots: initial?.screenshots ?? [],
        geminiAnalysis: initial?.geminiAnalysis ?? '',
        geminiTags: initial?.geminiTags ?? [],
        isManual: true,
        binanceOrderId: initial?.binanceOrderId ?? '',
      }

      await onSave(trade)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const pnl = calcPnL()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full max-w-lg bg-gray-900 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-gray-900 flex items-center justify-between px-4 py-3 border-b border-gray-800 rounded-t-2xl">
          <h2 className="text-white font-semibold">
            {initial?.id ? '거래 수정' : '거래 추가'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 방향 + 심볼 */}
          <div className="flex gap-2">
            <div className="flex rounded-xl overflow-hidden border border-gray-700 flex-shrink-0">
              {(['long', 'short'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('direction', d)}
                  className={`px-4 py-2 text-sm font-semibold transition-colors ${
                    form.direction === d
                      ? d === 'long'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {d === 'long' ? '롱' : '숏'}
                </button>
              ))}
            </div>
            <input
              value={form.symbol}
              onChange={(e) => set('symbol', e.target.value)}
              placeholder="BTCUSDT"
              className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm uppercase"
            />
            <div className="flex rounded-xl overflow-hidden border border-gray-700 flex-shrink-0">
              {(['closed', 'open'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('status', s)}
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${
                    form.status === s
                      ? s === 'closed'
                        ? 'bg-gray-600 text-white'
                        : 'bg-yellow-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {s === 'closed' ? '완료' : '진행'}
                </button>
              ))}
            </div>
          </div>

          {/* 가격 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">진입가 *</label>
              <input
                required
                type="number"
                step="any"
                value={form.entryPrice}
                onChange={(e) => set('entryPrice', e.target.value)}
                placeholder="75000"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">청산가</label>
              <input
                type="number"
                step="any"
                value={form.exitPrice}
                onChange={(e) => set('exitPrice', e.target.value)}
                placeholder="76000"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 수량 + 레버리지 */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">수량 (BTC)</label>
              <input
                type="number"
                step="any"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="0.1"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">레버리지</label>
              <input
                type="number"
                value={form.leverage}
                onChange={(e) => set('leverage', e.target.value)}
                placeholder="10"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">수수료</label>
              <input
                type="number"
                step="any"
                value={form.fee}
                onChange={(e) => set('fee', e.target.value)}
                placeholder="0"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 손절/목표 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">손절가</label>
              <input
                type="number"
                step="any"
                value={form.stopLoss}
                onChange={(e) => set('stopLoss', e.target.value)}
                placeholder="74000"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">목표가</label>
              <input
                type="number"
                step="any"
                value={form.takeProfit}
                onChange={(e) => set('takeProfit', e.target.value)}
                placeholder="77000"
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 시간 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">진입 시간 *</label>
              <input
                required
                type="datetime-local"
                value={form.entryDate}
                onChange={(e) => set('entryDate', e.target.value)}
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">청산 시간</label>
              <input
                type="datetime-local"
                value={form.exitDate}
                onChange={(e) => set('exitDate', e.target.value)}
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 손익 미리보기 */}
          {pnl != null && (
            <div
              className={`rounded-xl px-4 py-2 text-center font-bold ${
                pnl >= 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}
            >
              {pnl >= 0 ? '+' : ''}
              {pnl.toFixed(2)} USDT
            </div>
          )}

          {/* 진입 타입 */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">진입 타입</label>
            <div className="flex flex-wrap gap-2">
              {ENTRY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('entryType', form.entryType === t.value ? '' : t.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    form.entryType === t.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 진입 근거 */}
          <div>
            <label className="text-gray-400 text-xs mb-1 block">진입 근거</label>
            <textarea
              value={form.entryReason}
              onChange={(e) => set('entryReason', e.target.value)}
              placeholder="왜 진입했는가?"
              rows={2}
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* 청산 근거 */}
          <div>
            <label className="text-gray-400 text-xs mb-1 block">청산 근거</label>
            <textarea
              value={form.exitReason}
              onChange={(e) => set('exitReason', e.target.value)}
              placeholder="왜 청산했는가?"
              rows={2}
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* 태그 */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">태그</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    form.tags.includes(tag)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 반성 */}
          <div>
            <label className="text-gray-400 text-xs mb-1 block">반성</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="이번 거래에서 아쉬웠던 점..."
              rows={2}
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* 교훈 */}
          <div>
            <label className="text-gray-400 text-xs mb-1 block">교훈 (한 줄)</label>
            <input
              value={form.lesson}
              onChange={(e) => set('lesson', e.target.value)}
              placeholder="이번 거래에서 배운 것"
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm"
            />
          </div>

          {/* 저장 버튼 */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </form>
      </div>
    </div>
  )
}
