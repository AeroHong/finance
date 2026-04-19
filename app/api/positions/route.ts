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
    const url = `https://fapi.binance.com/fapi/v2/positionRisk?${params}&signature=${signature}`

    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Binance API 오류: ${err}`)
    }
    const all = await res.json()

    // 실제 포지션만 필터 (수량 0이 아닌 것)
    const open = all.filter((p: { positionAmt: string }) => parseFloat(p.positionAmt) !== 0)
    return NextResponse.json({ positions: open })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
