import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Callback Paygate reçu:', body);

    const {
      tx_reference,
      identifier,
      payment_reference,
      amount,
      datetime,
      payment_method,
      phone_number
    } = body;

    console.log(`Paiement ${payment_method} reçu:`, {
      commande: identifier,
      reference: payment_reference,
      montant: amount,
      telephone: phone_number,
      date: datetime
    });

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Erreur callback:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}