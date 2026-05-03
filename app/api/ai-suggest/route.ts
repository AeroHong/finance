import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { adminAuth } from '@/lib/firebase-admin'
import { parseKlines, buildSummary, IndicatorSummary } from '@/lib/indicators'

const ALLOWED_INTERVALS = ['5m', '15m', '1h', '4h', '1d']

export async function POST(req: NextRequest) {
  // 1. 인증
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await adminAuth.verifyIdToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Body 파싱
  const { interval = '1h', balance = 0, openPosition = null } = await req.json()
  if (!ALLOWED_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
  }

  // 3. Binance klines 수집 (limit=200, Public)
  const klinesRes = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${interval}&limit=200`
  )
  if (!klinesRes.ok) return NextResponse.json({ error: 'Binance API error' }, { status: 502 })
  const rawKlines: string[][] = await klinesRes.json()
  const klines = parseKlines(rawKlines)

  // 4. 지표 계산
  const summary: IndicatorSummary = buildSummary(klines, interval)

  // 5. Claude API 호출
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const positionText = openPosition
    ? `현재 오픈 포지션: ${openPosition.direction === 'long' ? '롱' : '숏'} 평단 $${openPosition.avgEntry}, 수량 ${openPosition.qty} BTC, SL $${openPosition.sl}`
    : '현재 오픈 포지션: 없음'

  const prompt = `당신은 BTC 선물 트레이딩 전략 분석가입니다.
아래 기술적 지표를 분석하여 매매 전략을 제안해주세요.

## 현재 시장 데이터 (BTCUSDT ${interval})
- 현재가: $${summary.currentPrice.toFixed(2)}
- 이동평균: ${summary.priceVsEma}
- ATR(14): $${summary.atr.toFixed(2)}
- MACD: ${summary.macdStatus} (MACD: ${summary.macd.toFixed(2)}, Signal: ${summary.macdSignal.toFixed(2)}, Hist: ${summary.macdHistogram.toFixed(2)})
- RSI(14): ${summary.rsi.toFixed(1)}
- 최근 스윙 고점: ${summary.swingHigh ? `$${summary.swingHigh.price.toFixed(2)} (${summary.swingHigh.barsAgo}봉 전)` : '없음'}
- 최근 스윙 저점: ${summary.swingLow ? `$${summary.swingLow.price.toFixed(2)} (${summary.swingLow.barsAgo}봉 전)` : '없음'}

## 계좌 정보
- 자본: $${balance}
- 리스크: 자본의 3% 고정
- ${positionText}

## 요청
1. 시장 상황 분석 (3-4문장)
2. 추천 매매 방향 및 근거
3. 아래 JSON 형식으로 전략 제안:

\`\`\`json
{
  "direction": "long" | "short" | "wait",
  "reason": "진입 근거 한 줄",
  "entryZone": { "from": 숫자, "to": 숫자 },
  "sl": 숫자,
  "tp1": 숫자,
  "tp2": 숫자,
  "rr": 숫자,
  "confidence": "high" | "medium" | "low"
}
\`\`\`

wait인 경우 entry/sl/tp는 0으로 설정. 반드시 위 JSON 블록을 포함해주세요.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0].type === 'text' ? message.content[0].text : ''

  // 6. JSON 파싱
  let strategyJson = null
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/)
  if (jsonMatch) {
    try { strategyJson = JSON.parse(jsonMatch[1]) } catch { /* ignore */ }
  }

  return NextResponse.json({
    analysis: content,
    strategy: strategyJson,
    indicators: summary,
  })
}
