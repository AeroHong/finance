import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'
import { adminAuth } from '@/lib/firebase-admin'

function sign(query: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex')
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    await adminAuth.verifyIdToken(token)

    const apiKey = process.env.BINANCE_API_KEY!
    const apiSecret = process.env.BINANCE_API_SECRET!
    const timestamp = Date.now()
    const params = new URLSearchParams({ timestamp: String(timestamp) })
    const signature = sign(params.toString(), apiSecret)
    const url = `https://fapi.binance.com/fapi/v2/balance?${params}&signature=${signature}`

    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()

    // USDT 잔고만 추출
    const usdt = data.find((b: { asset: string }) => b.asset === 'USDT')
    if (!usdt) return NextResponse.json({ error: 'USDT 잔고 없음' }, { status: 404 })

    return NextResponse.json({
      balance: parseFloat(usdt.balance),           // 지갑 잔고
      crossUnPnl: parseFloat(usdt.crossUnPnl),     // 미실현 손익
      availableBalance: parseFloat(usdt.availableBalance), // 사용 가능 잔고
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
