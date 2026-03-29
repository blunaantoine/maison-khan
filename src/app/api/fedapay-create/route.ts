import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    // Créer immédiatement un Payment record en "pending"
    // Ainsi le cron peut vérifier le statut même si le client ferme la fenêtre
    try {
      const existingPayment = await db.payment.findFirst({
        where: { orderId, transactionId: String(transaction.id) }
      })

      if (!existingPayment) {
        await db.payment.create({
          data: {
            orderId,
            transactionId: String(transaction.id),
            amount,
            currency: 'XOF',
            status: 'pending',
            paymentMethod: 'fedapay',
            operator: 'fedapay',
            metadata: JSON.stringify({ source: 'fedapay-create', transactionId: transaction.id })
          }
        })
      }
    } catch (dbErr) {
      // Ne pas bloquer le paiement si la création du Payment échoue
      console.error('Erreur création Payment record:', dbErr)
    }

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
