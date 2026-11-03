/**
 * Test E2E — vérification de signature svix du webhook Resend.
 *
 * Usage : bun scripts/test-webhook-signature.ts
 * Lit RESEND_WEBHOOK_SECRET dans le .env (chargé automatiquement par Bun).
 * Scénarios : signature valide (200), signature invalide (401), absente (401).
 * L'événement de test est clairement étiqueté « Test intégration EmailOqui »
 * pour être identifiable dans le dashboard EmailOqui.
 */
import crypto from 'crypto'

const SECRET = process.env.RESEND_WEBHOOK_SECRET
const URL = process.env.TEST_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/resend'

if (!SECRET) {
  console.error('❌ RESEND_WEBHOOK_SECRET absente du .env — rien à tester.')
  process.exit(1)
}

const body = JSON.stringify({
  type: 'email.opened',
  created_at: new Date().toISOString(),
  data: {
    email_id: 'evt_test_opened_' + Date.now(),
    from: 'contact@maison-khan.com',
    to: ['technique@maison-khan.com'],
    subject: '[MAISON KHAN] Test intégration EmailOqui',
  },
})

function sign(rawBody: string): { id: string; timestamp: string; signature: string } {
  const id = 'msg_' + crypto.randomBytes(8).toString('hex')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const keyBytes = Buffer.from(SECRET!.slice('whsec_'.length), 'base64')
  const sig = crypto
    .createHmac('sha256', keyBytes)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf-8')
    .digest('base64')
  return { id, timestamp, signature: `v1,${sig}` }
}

async function post(label: string, headers: Record<string, string>, expect: number) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
  const json = await res.json().catch(() => ({}))
  const pass = res.status === expect
  console.log(`${pass ? '✅' : '❌'} ${label} → HTTP ${res.status} (attendu ${expect}) ${JSON.stringify(json)}`)
  return pass
}

console.log(`Cible : ${URL}\n`)

// 1. Signature valide
const s = sign(body)
const ok1 = await post('Signature valide', {
  'svix-id': s.id,
  'svix-timestamp': s.timestamp,
  'svix-signature': s.signature,
}, 200)

// 2. Signature invalide (valeur pirate)
const badSig = 'v1,' + Buffer.from('signature-pirate-non-valide').toString('base64')
const ok2 = await post('Signature invalide', {
  'svix-id': 'msg_pirate',
  'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
  'svix-signature': badSig,
}, 401)

// 3. En-têtes de signature absents
const ok3 = await post('En-têtes svix absents', {}, 401)

console.log(ok1 && ok2 && ok3 ? '\n🎯 3/3 tests signature réussis' : '\n💥 ÉCHEC')
process.exit(ok1 && ok2 && ok3 ? 0 : 1)
