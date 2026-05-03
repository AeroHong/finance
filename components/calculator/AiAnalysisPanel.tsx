'use client'

import { useState, useRef, useEffect } from 'react'
import { User } from 'firebase/auth'
import { getIdToken } from 'firebase/auth'
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  SeriesType,
} from 'lightweight-charts'
import { BinancePosition, AiStrategyPayload } from '@/lib/types'

interface AiAnalysisPanelProps {
  user: User
  balance: number | null
  openPositions: BinancePosition[]
  onApplyStrategy: (strategy: AiStrategyPayload) => void
}

interface AnalysisResult {
  analysis: string
  strategy: {
    direction: 'long' | 'short' | 'wait'
    reason: string
    entryZone: { from: number; to: number }
    sl: number
    tp1: number
    tp2: number
    rr: number
    confidence: 'high' | 'medium' | 'low'
  } | null
  indicators: {
    currentPrice: number
    ema20: number
    ema50: number
    ema200: number
    atr: number
    macd: number
    macdSignal: number
    macdHistogram: number
    rsi: number
    priceVsEma: string
    macdStatus: string
  } | null
}

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null || !isFinite(n) || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const INTERVALS = ['5m', '15m', '1h', '4h', '1d']

export default function AiAnalysisPanel({ user, balance, openPositions, onApplyStrategy }: AiAnalysisPanelProps) {
  const [interval, setIntervalValue] = useState<string>('1h')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const macdContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const macdChartRef = useRef<IChartApi | null>(null)

  // 차트 초기화 및 interval 변경 시 재로드
  useEffect(() => {
    if (!chartContainerRef.current || !macdContainerRef.current) return

    // cleanup 이전 차트
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }
    if (macdChartRef.current) {
      macdChartRef.current.remove()
      macdChartRef.current = null
    }

    const chartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true },
    }

    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      width: chartContainerRef.current.clientWidth,
      height: 280,
    })
    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#3b82f6',
      downColor: '#ef4444',
      borderUpColor: '#3b82f6',
      borderDownColor: '#ef4444',
      wickUpColor: '#3b82f6',
      wickDownColor: '#ef4444',
    })

    const ema20Series = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1 })
    const ema50Series = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 1 })
    const ema200Series = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1 })

    const macdChart = createChart(macdContainerRef.current, {
      ...chartOptions,
      width: macdContainerRef.current.clientWidth,
      height: 80,
    })
    macdChartRef.current = macdChart

    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      color: '#6366f1',
      priceFormat: { type: 'price', precision: 2 },
    })

    // Binance 데이터 로드
    loadChartData(interval, candleSeries, ema20Series, ema50Series, ema200Series, macdHistSeries)

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
      if (macdContainerRef.current && macdChartRef.current) {
        macdChartRef.current.applyOptions({ width: macdContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      macdChart.remove()
      chartRef.current = null
      macdChartRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval])

  async function loadChartData(
    iv: string,
    candleSeries: ISeriesApi<SeriesType>,
    ema20Series: ISeriesApi<SeriesType>,
    ema50Series: ISeriesApi<SeriesType>,
    ema200Series: ISeriesApi<SeriesType>,
    macdHistSeries: ISeriesApi<SeriesType>
  ) {
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${iv}&limit=200`)
      if (!res.ok) return
      const raw: string[][] = await res.json()

      const candles = raw.map(k => ({
        time: Math.floor(Number(k[0]) / 1000) as number,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candleSeries.setData(candles as any)

      // EMA 계산
      const closes = raw.map(k => parseFloat(k[4]))
      const times = raw.map(k => Math.floor(Number(k[0]) / 1000))

      const ema20 = calcEmaLocal(closes, 20)
      const ema50 = calcEmaLocal(closes, 50)
      const ema200 = calcEmaLocal(closes, 200)

      const toLineData = (vals: number[]) =>
        vals
          .map((v, i) => ({ time: times[i] as number, value: v }))
          .filter(d => isFinite(d.value))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ema20Series.setData(toLineData(ema20) as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ema50Series.setData(toLineData(ema50) as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ema200Series.setData(toLineData(ema200) as any)

      // MACD 히스토그램
      const { histogram } = calcMacdLocal(closes)
      const macdData = histogram
        .map((v, i) => ({
          time: times[i] as number,
          value: v,
          color: v >= 0 ? '#6366f1' : '#ec4899',
        }))
        .filter(d => isFinite(d.value))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      macdHistSeries.setData(macdData as any)
    } catch {
      // 차트 로드 실패 시 무시
    }
  }

  async function handleAnalyze() {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken(user)
      const openPosition = openPositions.find(
        p => p.symbol === 'BTCUSDT' && parseFloat(p.positionAmt) !== 0
      )
      const res = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          interval,
          balance: balance ?? 0,
          openPosition: openPosition
            ? {
                direction: parseFloat(openPosition.positionAmt) > 0 ? 'long' : 'short',
                avgEntry: parseFloat(openPosition.entryPrice),
                qty: Math.abs(parseFloat(openPosition.positionAmt)),
                sl: null,
              }
            : null,
        }),
      })
      if (!res.ok) throw new Error('분석 실패')
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* 타임프레임 선택 */}
      <div className="flex gap-1">
        {INTERVALS.map(iv => (
          <button
            key={iv}
            onClick={() => setIntervalValue(iv)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              interval === iv ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {iv}
          </button>
        ))}
      </div>

      {/* 캔들 차트 */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <div ref={chartContainerRef} className="w-full" style={{ height: 280 }} />
        {/* MACD 서브차트 */}
        <div ref={macdContainerRef} className="w-full border-t border-gray-800" style={{ height: 80 }} />
      </div>

      {/* 지표 수치 요약 */}
      {result?.indicators && (
        <div className="bg-gray-900 rounded-2xl p-4 grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-400">EMA20 <span className="text-white">${fmt(result.indicators.ema20, 0)}</span></div>
          <div className="text-gray-400">EMA50 <span className="text-white">${fmt(result.indicators.ema50, 0)}</span></div>
          <div className="text-gray-400">ATR(14) <span className="text-white">${fmt(result.indicators.atr)}</span></div>
          <div className="text-gray-400">RSI <span className="text-white">{result.indicators.rsi?.toFixed(1)}</span></div>
          <div className="col-span-2 text-gray-400">MACD <span className="text-white">{result.indicators.macdStatus}</span></div>
        </div>
      )}

      {/* Claude 분석 요청 버튼 */}
      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors"
      >
        {loading ? '🤖 Claude 분석 중...' : '🤖 Claude 분석 요청'}
      </button>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* 분석 결과 */}
      {result && (
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          {/* 분석 텍스트 (JSON 블록 제거하고 표시) */}
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {result.analysis.replace(/```json[\s\S]*?```/g, '').trim()}
          </div>

          {/* 전략 제안 카드 */}
          {result.strategy && result.strategy.direction !== 'wait' && (
            <div className="border-t border-gray-700 pt-3 space-y-2">
              <div className="text-xs text-gray-500">제안 전략</div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-bold ${
                    result.strategy.direction === 'long' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {result.strategy.direction === 'long' ? '롱' : '숏'}
                </span>
                <span
                  className={`px-2 py-1 rounded-lg text-xs ${
                    result.strategy.confidence === 'high'
                      ? 'bg-green-800 text-green-200'
                      : result.strategy.confidence === 'medium'
                      ? 'bg-yellow-800 text-yellow-200'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  신뢰도 {result.strategy.confidence}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">
                  진입 구간
                  <span className="text-white ml-1">
                    ${fmt(result.strategy.entryZone?.from)} ~ ${fmt(result.strategy.entryZone?.to)}
                  </span>
                </div>
                <div className="text-gray-400">SL <span className="text-red-400 ml-1">${fmt(result.strategy.sl)}</span></div>
                <div className="text-gray-400">TP1 <span className="text-green-400 ml-1">${fmt(result.strategy.tp1)}</span></div>
                <div className="text-gray-400">TP2 <span className="text-green-400 ml-1">${fmt(result.strategy.tp2)}</span></div>
                <div className="text-gray-400">RR <span className="text-white ml-1">{result.strategy.rr?.toFixed(2)} R</span></div>
              </div>
              <div className="text-xs text-gray-500 italic">{result.strategy.reason}</div>

              {/* 전략 수립 탭으로 보내기 */}
              <button
                onClick={() => {
                  if (!result.strategy || result.strategy.direction === 'wait') return
                  const entryPrice =
                    (result.strategy.entryZone.from + result.strategy.entryZone.to) / 2
                  onApplyStrategy({
                    direction: result.strategy.direction,
                    entries: [{ price: entryPrice, qty: 0 }],
                    sl: result.strategy.sl,
                    tp1: result.strategy.tp1,
                    tp2: result.strategy.tp2,
                    rr: result.strategy.rr,
                  })
                }}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                전략 수립 탭으로 보내기 →
              </button>
            </div>
          )}

          {result.strategy?.direction === 'wait' && (
            <div className="border-t border-gray-700 pt-3 text-center text-gray-400 text-sm">
              ⏳ 현재 진입 대기 권장
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// 로컬 EMA 계산 (차트용)
function calcEmaLocal(closes: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const ema: number[] = []
  closes.forEach((c, i) => {
    if (i < period - 1) { ema.push(NaN); return }
    if (i === period - 1) {
      ema.push(closes.slice(0, period).reduce((a, b) => a + b) / period)
      return
    }
    ema.push(c * k + ema[i - 1] * (1 - k))
  })
  return ema
}

// 로컬 MACD 계산 (차트용)
function calcMacdLocal(closes: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = calcEmaLocal(closes, 12)
  const ema26 = calcEmaLocal(closes, 26)
  const macd = ema12.map((v, i) => (isFinite(v) && isFinite(ema26[i]) ? v - ema26[i] : NaN))
  const validMacd = macd.filter(isFinite)
  const signalArr = calcEmaLocal(validMacd, 9)
  const signal: number[] = new Array(macd.length).fill(NaN)
  let si = 0
  macd.forEach((v, i) => {
    if (isFinite(v)) { signal[i] = signalArr[si++] }
  })
  const histogram = macd.map((v, i) => (isFinite(v) && isFinite(signal[i]) ? v - signal[i] : NaN))
  return { macd, signal, histogram }
}
