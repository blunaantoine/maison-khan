/**
 * Test d'envoi SMS Africa's Talking (vérifie la configuration du .env).
 *
 * Usage (sur le VPS, dans /var/www/maison-khan) :
 *   bun scripts/test-sms.ts                 → envoie au(x) numéro(s) ADMIN_ALERT_PHONE
 *   bun scripts/test-sms.ts +22890000000    → envoie à ce numéro
 *
 * Bun charge automatiquement le fichier .env.
 */
import { isSmsConfigured, normalizePhone, sendSms } from '../src/lib/africastalking'

async function main() {
  if (!isSmsConfigured()) {
    console.error('❌ AFRICASTALKING_USERNAME et/ou AFRICASTALKING_API_KEY absentes du .env')
    process.exit(1)
  }
  const raw = process.argv[2] || process.env.ADMIN_ALERT_PHONE || ''
  const to = raw.split(',').map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p))
  if (to.length === 0) {
    console.error('❌ Aucun numéro valide (ADMIN_ALERT_PHONE absente ou invalide). Format : +228XXXXXXXX')
    process.exit(1)
  }

  console.log(`→ Envoi vers ${to.join(', ')} (compte : ${process.env.AFRICASTALKING_USERNAME})...`)
  const result = await sendSms({
    to,
    message: 'MAISON KHAN - Test SMS OK. Vous recevrez une alerte a chaque paiement confirme.',
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.success) {
    console.log('✅ SMS accepté par Africa\'s Talking')
  } else {
    console.error('❌ Échec — voir le détail ci-dessus (statusCode par destinataire)')
    process.exit(1)
  }
}

main()
