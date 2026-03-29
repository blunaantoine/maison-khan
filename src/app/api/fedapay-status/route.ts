import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { transactionId } = await req.json()

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId requis' }, { status: 400 })
    }

    const { FedaPay, Transaction } = require('fedapay')

    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment('live')

    const transaction = await Transaction.retrieve(transactionId)

    return NextResponse.json({
      success: true,
      status: transaction.status,   // 'approved' | 'pending' | 'declined' | 'canceled'
      id: transaction.id,
      amount: transaction.amount,
    })

  } catch (err: any) {
    console.error('[fedapay-status]', err)
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 })
  }
}