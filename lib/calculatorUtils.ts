export type Direction = 'long' | 'short'

// ─── SL 3-way 변환 ───────────────────────────────────────────────────────────

/** ATR배수 → SL 가격 */
export function slFromAtr(entry: number, atr: number, atrMult: number, dir: Direction): number {
  if (dir === 'long') return entry - atrMult * atr
  return entry + atrMult * atr
}

/** % → SL 가격 */
export function slFromPct(entry: number, pct: number, dir: Direction): number {
  if (dir === 'long') return entry * (1 - pct / 100)
  return entry * (1 + pct / 100)
}

/** SL 가격 → % */
export function pctFromSl(entry: number, sl: number, dir: Direction): number {
  if (dir === 'long') return ((entry - sl) / entry) * 100
  return ((sl - entry) / entry) * 100
}

/** SL 가격 → ATR 배수 */
export function atrMultFromSl(entry: number, sl: number, atr: number, dir: Direction): number {
  if (dir === 'long') return (entry - sl) / atr
  return (sl - entry) / atr
}

// ─── 포지션 사이즈 ────────────────────────────────────────────────────────────

/** 리스크 기반 포지션 사이즈 (BTC) */
export function calcSize(capital: number, riskPct: number, entry: number, sl: number): number {
  const slDiff = Math.abs(entry - sl)
  if (slDiff === 0) return NaN
  return calcRiskAmount(capital, riskPct) / slDiff
}

/** 포지션 명목가치 (USDT) */
export function calcNotional(size: number, entry: number): number {
  return size * entry
}

/** 리스크 금액 (USDT) */
export function calcRiskAmount(capital: number, riskPct: number): number {
  return capital * (riskPct / 100)
}

/** 자본 한도 기반 최대 포지션 사이즈 */
export function calcMaxSize(capital: number, maxLeverageMultiple: number, entry: number): number {
  return (capital * maxLeverageMultiple) / entry
}

// ─── 청산가 ────────────────────────────────────────────────────────────────────

/** 격리마진 기준 추정 청산가 */
export function calcLiqPrice(entry: number, leverage: number, dir: Direction): number {
  if (dir === 'long') return entry * (1 - 1 / leverage)
  return entry * (1 + 1 / leverage)
}

// ─── 손익비 / 예상 손익 ────────────────────────────────────────────────────────

/** 손익비 (R) */
export function calcRR(entry: number, tp: number, sl: number): number {
  return Math.abs(tp - entry) / Math.abs(entry - sl)
}

/** 예상 수익 (USDT, 양수) */
export function calcExpectedProfit(size: number, entry: number, tp: number): number {
  return size * Math.abs(tp - entry)
}

/** 예상 손실 (USDT, 음수) */
export function calcExpectedLoss(size: number, entry: number, sl: number): number {
  return -(size * Math.abs(entry - sl))
}

// ─── 분할 진입 ────────────────────────────────────────────────────────────────

/** 새 평단 (가중평균) */
export function calcNewAvgEntry(
  existingQty: number,
  existingEntry: number,
  addQty: number,
  addEntry: number
): number {
  const totalQty = existingQty + addQty
  return (existingQty * existingEntry + addQty * addEntry) / totalQty
}

/** 분할 진입 후 리스크 유지 SL */
export function calcNewSl(
  newAvgEntry: number,
  totalQty: number,
  capital: number,
  riskPct: number,
  dir: Direction
): number {
  const riskAmount = capital * (riskPct / 100)
  if (dir === 'long') return newAvgEntry - riskAmount / totalQty
  return newAvgEntry + riskAmount / totalQty
}

/** SL 변화량 */
export function calcSlDelta(newSl: number, existingSl: number): number {
  return newSl - existingSl
}
