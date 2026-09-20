/**
 * Tests E2E du système de notifications client (cloche 🔔).
 *
 * Couvre les 10 scénarios demandés :
 *  1. Un client peut voir ses notifications
 *  2. Un client ne peut pas voir celles d'un autre client
 *  3. Le compteur des non-lues fonctionne
 *  4. Une notification peut être marquée comme lue
 *  5. « Tout marquer comme lu » fonctionne
 *  6. L'admin peut créer une notification (user / users / rôle / tous)
 *  7. Un utilisateur normal ne peut pas utiliser l'API admin
 *  8. Une notification automatique est créée sur un événement (paiement confirmé)
 *  9. (affichage mobile → vérifié séparément via navigateur)
 * 10. Rien de cassé (les autres API répondent toujours)
 *
 * Usage : bun scripts/test-notifications.ts
 */

const BASE = 'http://localhost:3000'
const ADMIN = { email: 'technique@maison-khan.com', password: 'ChangeMe-Admin-2024!' }

let passed = 0
let failed = 0

function ok(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name} ${detail ? '— ' + detail : ''}`)
  }
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<{ status: number; data: any; setCookie?: string }> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.cookie) headers['Cookie'] = options.cookie
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: 'manual',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* réponse non JSON */
  }
  const setCookie = res.headers.get('set-cookie')?.split(';')[0]
  return { status: res.status, data, setCookie }
}

async function login(email: string, password: string): Promise<string | null> {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } })
  return r.setCookie ?? null
}

async function ensureUser(email: string, password: string, firstName: string): Promise<string | null> {
  // Tente l'inscription, ignore l'erreur si le compte existe déjà
  await api('/api/auth/register', {
    method: 'POST',
    body: { email, password, firstName, lastName: 'Test Notif' },
  })
  return login(email, password)
}

function cleanupName(tag: string) {
  return {
    email: `notif-${tag}-${Date.now()}@maison-khan.com`,
    password: 'TestNotif-2024!',
  }
}

async function main() {
  console.log('\n═══ TESTS E2E — Notifications client (cloche 🔔) ═══\n')

  // ── Préparation : sessions ──
  const adminCookie = await login(ADMIN.email, ADMIN.password)
  ok('Connexion admin', !!adminCookie)
  if (!adminCookie) return summary()

  const c1 = cleanupName('a')
  const c2 = cleanupName('b')
  const client1Cookie = await ensureUser(c1.email, c1.password, 'ClientUn')
  const client2Cookie = await ensureUser(c2.email, c2.password, 'ClientDeux')
  ok('Connexion client 1', !!client1Cookie)
  ok('Connexion client 2', !!client2Cookie)
  if (!client1Cookie || !client2Cookie) return summary()

  // IDs des clients (via /api/auth/me)
  const me1 = await api('/api/auth/me', { cookie: client1Cookie })
  const me2 = await api('/api/auth/me', { cookie: client2Cookie })
  const client1Id = me1.data?.user?.id
  const client2Id = me2.data?.user?.id
  ok('IDs clients récupérés', !!client1Id && !!client2Id)

  // ═══ SÉCURITÉ (avant tout) ═══
  console.log('\n── Sécurité ──')
  const denied = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: client1Cookie,
    body: { type: 'promotion', title: 'Piratage', message: 'Test interdit', target: 'all' },
  })
  ok("7b. Un client ne peut pas POSTER via l'API admin", denied.status === 403 || denied.status === 401, `(status ${denied.status})`)

  const deniedGet = await api('/api/admin/notifications', { cookie: client1Cookie })
  ok("7a. Un client ne peut pas LIRE l'API admin", deniedGet.status === 403 || deniedGet.status === 401, `(status ${deniedGet.status})`)

  const deniedRead = await api('/api/client/notifications', { cookie: client2Cookie })
  ok('0. Client 2 démarre avec 0 notification', deniedRead.status === 200 && (deniedRead.data.notifications?.length ?? 1) === 0)

  // ═══ SCÉNARIO 6 : l'admin crée des notifications ═══
  console.log('\n── 6. Admin : création de notifications ──')

  // 6a. vers UN utilisateur
  const sendOne = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      type: 'promotion',
      title: 'Ventes privées MAISON KHAN',
      message: '-20% sur la collection Aurore ce week-end, en boutique et en ligne.',
      link: '#catalogue',
      target: 'user',
      userId: client1Id,
    },
  })
  ok('6a. Envoi à UN utilisateur', sendOne.status === 200 && sendOne.data.sentCount === 1, JSON.stringify(sendOne.data))

  // 6b. vers PLUSIEURS utilisateurs
  const sendMulti = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      type: 'message',
      title: 'Merci pour votre fidélité',
      message: 'Un message personnel de toute l’équipe MAISON KHAN.',
      target: 'users',
      userIds: [client1Id, client2Id],
    },
  })
  ok('6b. Envoi à PLUSIEURS (2) utilisateurs', sendMulti.status === 200 && sendMulti.data.sentCount === 2, JSON.stringify(sendMulti.data))

  // 6c. vers TOUS (rôle customer)
  const sendRole = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      type: 'system',
      title: 'Maintenance planifiée',
      message: 'Le site sera indisponible dimanche de 2h à 4h.',
      target: 'role',
      role: 'customer',
    },
  })
  ok('6c. Envoi par RÔLE (clients)', sendRole.status === 200 && sendRole.data.sentCount >= 2, JSON.stringify(sendRole.data))

  // 6d. validations
  const badType = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: adminCookie,
    body: { type: 'inconnu', title: 'Titre valide', message: 'Message valide', target: 'all' },
  })
  ok('6d. Type invalide rejeté (400)', badType.status === 400)

  const badLink = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: adminCookie,
    body: { type: 'promotion', title: 'Titre valide', message: 'Message valide', link: 'https://evil.example.com', target: 'all' },
  })
  ok('6e. Lien externe rejeté (400)', badLink.status === 400)

  const shortTitle = await api('/api/admin/notifications', {
    method: 'POST',
    cookie: adminCookie,
    body: { type: 'promotion', title: 'A', message: 'Message valide', target: 'all' },
  })
  ok('6f. Titre trop court rejeté (400)', shortTitle.status === 400)

  // ═══ SCÉNARIO 1+2+3 : lecture, isolation, compteur ═══
  console.log('\n── 1/2/3. Lecture client, isolation, compteur ──')

  const list1 = await api('/api/client/notifications?pageSize=15', { cookie: client1Cookie })
  ok('1a. Client 1 voit ses notifications', list1.status === 200 && list1.data.notifications.length >= 3, `${list1.data.notifications?.length} notifs`)
  ok(
    '1b. Champs complets (title, message, type, isRead, link, createdAt)',
    list1.data.notifications.every((n: any) => n.title && n.message && n.type && typeof n.isRead === 'boolean' && n.createdAt)
  )

  // Client 1 : 3 non-lues (ventes privées, fidélité, maintenance)
  ok('3a. Compteur non-lues client 1 = 3', list1.data.unreadCount === 3, `reçu ${list1.data.unreadCount}`)

  const count1 = await api('/api/client/notifications/unread-count', { cookie: client1Cookie })
  ok('3b. Endpoint unread-count cohérent', count1.data.count === 3, `reçu ${count1.data.count}`)

  // Isolation : client 2 ne voit QUE ses 2 notifs (fidélité + maintenance), pas celle de client 1
  const list2 = await api('/api/client/notifications?pageSize=15', { cookie: client2Cookie })
  const titles2 = (list2.data.notifications ?? []).map((n: any) => n.title)
  ok(
    '2a. Client 2 ne voit pas la notification exclusive de client 1',
    list2.data.notifications.length === 2 && !titles2.includes('Ventes privées MAISON KHAN'),
    JSON.stringify(titles2)
  )
  ok('2b. Client 2 a bien reçu les envois partagés', titles2.includes('Merci pour votre fidélité') && titles2.includes('Maintenance planifiée'))

  // Tentative de lecture d'une notif d'un autre utilisateur
  const notif1 = list1.data.notifications.find((n: any) => n.title === 'Ventes privées MAISON KHAN')
  const stealRead = await api('/api/client/notifications', {
    method: 'PUT',
    cookie: client2Cookie,
    body: { id: notif1.id },
  })
  ok('2c. Client 2 ne peut pas marquer lue la notif de client 1 (404)', stealRead.status === 404, `status ${stealRead.status}`)

  const stealDelete = await api('/api/client/notifications', {
    method: 'DELETE',
    cookie: client2Cookie,
    body: { id: notif1.id },
  })
  ok('2d. Client 2 ne peut pas supprimer la notif de client 1 (404)', stealDelete.status === 404, `status ${stealDelete.status}`)

  // ═══ SCÉNARIO 4 : marquer comme lu ═══
  console.log('\n── 4. Marquer une notification comme lue ──')
  const markOne = await api('/api/client/notifications', {
    method: 'PUT',
    cookie: client1Cookie,
    body: { id: notif1.id },
  })
  ok('4a. Marquage lu (200)', markOne.status === 200)

  const afterMark = await api('/api/client/notifications/unread-count', { cookie: client1Cookie })
  ok('4b. Compteur décrémenté (3 → 2)', afterMark.data.count === 2, `reçu ${afterMark.data.count}`)

  // ═══ SCÉNARIO 5 : tout marquer comme lu ═══
  console.log('\n── 5. Tout marquer comme lu ──')
  const markAll = await api('/api/client/notifications', {
    method: 'PUT',
    cookie: client1Cookie,
    body: { all: true },
  })
  ok('5a. Tout marquer lu (200)', markAll.status === 200 && markAll.data.count === 2)

  const afterAll = await api('/api/client/notifications/unread-count', { cookie: client1Cookie })
  ok('5b. Compteur à zéro', afterAll.data.count === 0)

  // Suppression
  const del = await api('/api/client/notifications', {
    method: 'DELETE',
    cookie: client1Cookie,
    body: { id: notif1.id },
  })
  ok('5c. Suppression d’une notification', del.status === 200)

  // Filtres + pagination
  const filterType = await api('/api/client/notifications?type=message', { cookie: client1Cookie })
  ok(
    '5d. Filtre par type (message → 1 résultat)',
    filterType.status === 200 && filterType.data.total === 1 && filterType.data.notifications[0]?.type === 'message'
  )
  const filterUnread = await api('/api/client/notifications?unread=1', { cookie: client1Cookie })
  ok('5e. Filtre non-lues → 0 résultat (tout est lu)', filterUnread.data.total === 0)

  // ═══ SCÉNARIO 8 : notification automatique sur événement ═══
  console.log('\n── 8. Notification automatique (paiement confirmé) ──')

  // L'API orders n'exige pas de productId réel (productName + price suffisent)
  // → commande de test sans polluer le catalogue.
  const createTestOrder = async () =>
    api('/api/orders', {
      method: 'POST',
      cookie: client1Cookie,
      body: {
        items: [{ productName: 'Bottine Aurore (test)', productImage: null, size: '40', quantity: 1, price: 25000 }],
        customerInfo: { email: c1.email, phone: '+228 90 00 00 00', firstName: 'ClientUn', lastName: 'Test Notif' },
        shippingAddress: { address: 'Rue du Test 12', city: 'Lomé', country: 'Togo' },
        paymentMethod: 'direct',
        subtotal: 25000,
        shippingCost: 0,
        total: 25000,
      },
    })

  const orderRes = await createTestOrder()
  ok('8a. Commande créée (client 1)', orderRes.status === 200 || orderRes.status === 201, `status ${orderRes.status}`)

  const orderId = orderRes.data?.order?.id
  if (orderId) {
    // Aucune notification client ne doit exister pour le paiement non vérifié
    const before = await api('/api/client/notifications/unread-count', { cookie: client1Cookie })
    ok('8b. AVANT paiement vérifié : 0 notification de commande', before.data.count === 0, `reçu ${before.data.count}`)

    // Admin vérifie le paiement → notifyPaymentConfirmed → notif in-app
    const payRes = await api('/api/admin/orders', {
      method: 'PUT',
      cookie: adminCookie,
      body: { id: orderId, paymentStatus: 'paid', status: 'paid' },
    })
    ok('8c. Paiement confirmé par l’admin', payRes.status === 200, JSON.stringify(payRes.data).slice(0, 120))

    const after = await api('/api/client/notifications?pageSize=5', { cookie: client1Cookie })
    const paymentNotif = (after.data.notifications ?? []).find((n: any) => n.type === 'payment')
    ok('8d. Notification automatique « Paiement reçu » créée', !!paymentNotif, JSON.stringify(after.data.notifications?.map((n: any) => n.type)))
    if (paymentNotif) {
      ok(
        '8e. Contenu conforme (titre, message, lien, orderId)',
        paymentNotif.title.includes('Paiement') &&
          paymentNotif.message.includes('XOF') &&
          paymentNotif.link === '#account:orders' &&
          paymentNotif.orderId === orderId
      )
      ok('8f. senderId null (automatique)', paymentNotif.senderId === null)
    }

    // Changement de statut → notification ORDER
    await api('/api/admin/orders', {
      method: 'PUT',
      cookie: adminCookie,
      body: { id: orderId, status: 'shipped', trackingNumber: 'MK-TEST-123' },
    })
    const afterShip = await api('/api/client/notifications?pageSize=5', { cookie: client1Cookie })
    const shipNotif = (afterShip.data.notifications ?? []).find((n: any) => n.type === 'order')
    ok('8g. Changement de statut → notification « Commande expédiée »', !!shipNotif, JSON.stringify(afterShip.data.notifications?.map((n: any) => n.type)))
    if (shipNotif) {
      ok('8h. Message de suivi inclus', shipNotif.message.includes('MK-TEST-123'))
    }

    // Règle métier : statut changé SANS paiement → aucune notif client
    const order2 = await createTestOrder()
    const order2Id = order2.data?.order?.id
    if (order2Id) {
      await api('/api/admin/orders', {
        method: 'PUT',
        cookie: adminCookie,
        body: { id: order2Id, status: 'processing' }, // paymentStatus reste pending
      })
      const afterPending = await api('/api/client/notifications?pageSize=5', { cookie: client1Cookie })
      const pendingNotifs = (afterPending.data.notifications ?? []).filter((n: any) => n.orderId === order2Id)
      ok('8i. Statut changé SANS paiement vérifié → 0 notification client', pendingNotifs.length === 0, `${pendingNotifs.length} notif(s) reçue(s)`)
    }
  }

  // ═══ SCÉNARIO 10 : historique admin + stats + rien de cassé ═══
  console.log('\n── 10. Historique admin, stats, intégrité ──')

  const history = await api('/api/admin/notifications', { cookie: adminCookie })
  ok('10a. Historique admin accessible', history.status === 200)
  // NB : un batch disparaît de l'historique si TOUTES ses lignes ont été
  // supprimées par leurs destinataires (le batch « un utilisateur » a été
  // supprimé en 5c par client 1) — comportement documenté.
  const batchTitles = (history.data.batches ?? []).map((b: any) => b.title)
  ok(
    '10b. Batchs groupés présents (multi + rôle + auto)',
    (history.data.batches ?? []).length >= 3 && batchTitles.includes('Merci pour votre fidélité') && batchTitles.includes('Maintenance planifiée'),
    JSON.stringify(batchTitles)
  )
  const multiBatch = (history.data.batches ?? []).find((b: any) => b.sentCount === 2)
  ok('10c. Batch « plusieurs » montre 2 destinataires', !!multiBatch)
  const autoBatch = (history.data.batches ?? []).find((b: any) => b.senderId === null)
  ok('10d. Notifications automatiques dans l’historique (senderId null)', !!autoBatch, JSON.stringify(batchTitles))
  ok('10e. Stats présentes', typeof history.data.stats?.totalSent === 'number' && typeof history.data.stats?.totalUnread === 'number' && typeof history.data.stats?.sentToday === 'number')
  ok('10f. Destinataires listés pour le composer', Array.isArray(history.data.recipients) && history.data.recipients.length >= 3)

  // Rien de cassé : les API existantes répondent
  const health = await api('/api/health')
  ok('10g. /api/health répond', health.status === 200)
  const adminNotifCenter = await api('/api/notifications', { cookie: adminCookie })
  ok('10h. Centre de notifications admin (existant) intact', adminNotifCenter.status === 200)
  const adminPushCampaigns = await api('/api/admin/push-campaigns', { cookie: adminCookie })
  ok('10i. Campagnes push (existant) intactes', adminPushCampaigns.status === 200)

  summary()
}

function summary() {
  console.log(`\n════════════════════════════════════════`)
  console.log(`  RÉSULTAT : ${passed} réussis · ${failed} échoués`)
  console.log(`════════════════════════════════════════\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Erreur fatale des tests :', e)
  summary()
})
