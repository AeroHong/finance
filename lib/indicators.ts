// Binance klines 배열: [openTime, open, high, low, close, volume, ...]
export interface Kline {
  time: number   // openTime (ms)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function parseKlines(raw: string[][]): Kline[] {
  return raw.map(k => ({
    time: Number(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}

// EMA
export function calcEma(closes: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const ema: number[] = []
  closes.forEach((c, i) => {
    if (i < period - 1) { ema.push(NaN); return }
    if (i === period - 1) { ema.push(closes.slice(0, period).reduce((a, b) => a + b) / period); return }
    ema.push(c * k + ema[i - 1] * (1 - k))
  })
  return ema
}

// MACD (12, 26, 9)
export function calcMacd(closes: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = calcEma(closes, 12)
  const ema26 = calcEma(closes, 26)
  const macd = ema12.map((v, i) => (isFinite(v) && isFinite(ema26[i]) ? v - ema26[i] : NaN))
  const validMacd = macd.filter(isFinite)
  const signalArr = calcEma(validMacd, 9)
  // signal을 macd 길이에 맞게 패딩
  const signal: number[] = new Array(macd.length).fill(NaN)
  let si = 0
  macd.forEach((v, i) => {
    if (isFinite(v)) { signal[i] = signalArr[si++] }
  })
  const histogram = macd.map((v, i) => (isFinite(v) && isFinite(signal[i]) ? v - signal[i] : NaN))
  return { macd, signal, histogram }
}

// RSI
export function calcRsi(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN)
  for (let i = period; i < closes.length; i++) {
    const gains: number[] = [], losses: number[] = []
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1]
      if (diff > 0) gains.push(diff); else losses.push(Math.abs(diff))
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / period
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return rsi
}

// ATR (Wilder's)
export function calcAtr(klines: Kline[], period = 14): number[] {
  const tr = klines.map((k, i) => {
    if (i === 0) return k.high - k.low
    const prev = klines[i - 1].close
    return Math.max(k.high - k.low, Math.abs(k.high - prev), Math.abs(k.low - prev))
  })
  const atr: number[] = new Array(klines.length).fill(NaN)
  const init = tr.slice(0, period).reduce((a, b) => a + b) / period
  atr[period - 1] = init
  for (let i = period; i < klines.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  }
  return atr
}

// 스윙 고점/저점 (좌우 N봉 기준)
export function findSwings(klines: Kline[], n = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = new Array(klines.length).fill(NaN)
  const lows: number[] = new Array(klines.length).fill(NaN)
  for (let i = n; i < klines.length - n; i++) {
    const window = klines.slice(i - n, i + n + 1)
    if (klines[i].high === Math.max(...window.map(k => k.high))) highs[i] = klines[i].high
    if (klines[i].low === Math.min(...window.map(k => k.low))) lows[i] = klines[i].low
  }
  return { highs, lows }
}

// 마지막 유효 스윙 고점/저점
export function lastSwing(arr: number[]): { price: number; barsAgo: number } | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFinite(arr[i])) return { price: arr[i], barsAgo: arr.length - 1 - i }
  }
  return null
}

// 지표 요약 텍스트 (Claude 프롬프트용)
export interface IndicatorSummary {
  currentPrice: number
  interval: string
  ema20: number
  ema50: number
  ema200: number
  atr: number
  macd: number
  macdSignal: number
  macdHistogram: number
  rsi: number
  swingHigh: { price: number; barsAgo: number } | null
  swingLow: { price: number; barsAgo: number } | null
  priceVsEma: string   // e.g. "EMA20 위, EMA50 위, EMA200 위"
  macdStatus: string   // e.g. "양수 증가 (상승 모멘텀)"
}

export function buildSummary(klines: Kline[], interval: string): IndicatorSummary {
  const closes = klines.map(k => k.close)
  const last = closes.length - 1
  const currentPrice = closes[last]

  const ema20arr = calcEma(closes, 20)
  const ema50arr = calcEma(closes, 50)
  const ema200arr = calcEma(closes, 200)
  const atrArr = calcAtr(klines)
  const { macd: macdArr, signal: sigArr, histogram: histArr } = calcMacd(closes)
  const rsiArr = calcRsi(closes)
  const { highs, lows } = findSwings(klines)

  const ema20 = ema20arr[last]
  const ema50 = ema50arr[last]
  const ema200 = ema200arr[last]
  const atr = atrArr[last]
  const macd = macdArr[last]
  const macdSignal = sigArr[last]
  const macdHistogram = histArr[last]
  const rsi = rsiArr[last]

  const priceVsEma = [
    currentPrice > ema20 ? `EMA20(${ema20.toFixed(0)}) 위` : `EMA20(${ema20.toFixed(0)}) 아래`,
    currentPrice > ema50 ? `EMA50(${ema50.toFixed(0)}) 위` : `EMA50(${ema50.toFixed(0)}) 아래`,
    isFinite(ema200) ? (currentPrice > ema200 ? `EMA200(${ema200.toFixed(0)}) 위` : `EMA200(${ema200.toFixed(0)}) 아래`) : 'EMA200 계산중',
  ].join(', ')

  const macdStatus = isFinite(macdHistogram)
    ? macdHistogram > 0
      ? macdHistogram > (histArr[last - 1] ?? 0) ? '양수 증가 (상승 모멘텀 강화)' : '양수 감소 (상승 모멘텀 약화)'
      : macdHistogram < (histArr[last - 1] ?? 0) ? '음수 감소 (하락 모멘텀 강화)' : '음수 증가 (하락 모멘텀 약화)'
    : '계산중'

  return {
    currentPrice, interval,
    ema20, ema50, ema200, atr,
    macd, macdSignal, macdHistogram, rsi,
    swingHigh: lastSwing(highs),
    swingLow: lastSwing(lows),
    priceVsEma, macdStatus,
  }
}
