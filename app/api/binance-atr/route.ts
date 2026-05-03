import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'

const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d']

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    await adminAuth.verifyIdToken(token)

    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') ?? 'BTCUSDT'
    const interval = searchParams.get('interval') ?? '5m'

    if (!ALLOWED_INTERVALS.includes(interval)) {
      return NextResponse.json({ error: `허용되지 않는 interval. 허용값: ${ALLOWED_INTERVALS.join(', ')}` }, { status: 400 })
    }

    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=200`
    const res = await fetch(url)
    if (!res.ok) throw new Error(await res.text())

    // klines: [openTime, open, high, low, close, ...]
    const klines: string[][] = await res.json()
    if (klines.length < 15) {
      return NextResponse.json({ error: 'ATR 계산에 충분한 데이터 없음' }, { status: 500 })
    }

    // Wilder's ATR(14)
    const period = 14

    // TR 계산
    const trs: number[] = []
    for (let i = 1; i < klines.length; i++) {
      const high = parseFloat(klines[i][2])
      const low = parseFloat(klines[i][3])
      const prevClose = parseFloat(klines[i - 1][4])
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      trs.push(tr)
    }

    // 초기 ATR = 첫 14개 TR 단순평균
    let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period

    // Wilder's smoothing
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period
    }

    return NextResponse.json({ atr, interval, symbol })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
