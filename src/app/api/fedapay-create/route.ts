import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  
  try {
    const { amount, orderId, email, firstname, lastname } = await request.json()

    if (!amount || !orderId) {
      return NextResponse.json(
        { error: 'amount et orderId requis' }, 
        { status: 400 }
      )
    }

    const { FedaPay, Transaction } = require('fedapay')
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment('live')

    const transaction = await Transaction.create({
      amount,
      description: `Commande MAISON KHAN #${orderId}`,
      currency: { iso: 'XOF' },
      custom_id: `MKHAN_${orderId}_${Date.now()}`,
      customer: {
        email:     email     || 'client@maison-khan.com',
        firstname: firstname || 'Client',
        lastname:  lastname  || 'KHAN'
      }
    })

    return NextResponse.json({ 
      transactionId: transaction.id,
      token: transaction.token
    })

  } catch (error: any) {
    console.error('Erreur:', error.message)
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}