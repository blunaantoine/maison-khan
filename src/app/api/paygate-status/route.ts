import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { identifier } = body

    if (!identifier) {
      return NextResponse.json({ error: 'Identifier requis' }, { status: 400 })
    }

    const response = await fetch('https://paygateglobal.com/api/v2/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: process.env.PAYGATE_AUTH_TOKEN,
        identifier: identifier
      })
    })

    const data = await response.json()
    console.log('Réponse PayGate status:', data)

    // 0 = Paiement réussi
    // 2 = En cours
    // 4 = Expiré
    // 6 = Annulé

    return NextResponse.json({
      success: true,
      tx_reference: data.tx_reference,
      status: data.status?.toString(), // Important : string
      payment_reference: data.payment_reference,
      datetime: data.datetime,
      payment_method: data.payment_method
    })

  } catch (error) {
    console.error('Status error:', error)
    return NextResponse.json({ success: false, error: 'Erreur serveur' })
  }
}