import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY || ''
  })
}