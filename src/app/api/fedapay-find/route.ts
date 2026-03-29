import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('orderId')

  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.fedapay.com/v1/transactions?filters[custom_id][prefix]=MKHAN_${orderId}&page[size]=1`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const data = await res.json()
    const tx = data?.['v1/transactions']?.[0]

    if (tx?.id) {
      return NextResponse.json({ transactionId: tx.id, status: tx.status })
    }

    return NextResponse.json({ transactionId: null })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}