import { NextResponse } from 'next/server'

export async function POST(request: Request) {

  try {
    const { transactionId } = await request.json()

    if (!transactionId) {
      return NextResponse.json(
        { error: 'transactionId requis' }, 
        { status: 400 }
      )
    }

    const { FedaPay, Transaction } = require('fedapay')
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment('live')

    const trx = await Transaction.retrieve(Number(transactionId))

    return NextResponse.json({ status: trx.status })

  } catch (error: any) {
    console.error('Erreur:', error.message)
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}