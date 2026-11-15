import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth'

/**
 * MAISON KHAN — Ouverture / fermeture du site au public.
 *
 * Quand le site est « fermé » (réglage SiteSetting `site_closed` = "true"),
 * les visiteurs voient la page « Ouverture très prochaine » et ne peuvent pas
 * commander ; les comptes admin et manager actifs voient et gèrent la
 * boutique normalement. Le réglage se change depuis le panneau admin
 * (bouton « Fermer le site au public ») ou en ligne de commande
 * (bun scripts/site-access.ts close|open).
 */

const SETTING_KEY = 'site_closed'

/**
 * Le site est-il fermé au public ? Lu en base à chaque fois (lecture indexée,
 * négligeable) : pas de cache mémoire, car les routes API et les pages sont
 * des modules séparés et un cache rendrait le bouton lent à s'appliquer.
 * Ouvert si la base est illisible.
 */
export async function isSiteClosed(): Promise<boolean> {
  try {
    const row = await db.siteSetting.findUnique({ where: { key: SETTING_KEY } })
    return row?.value === 'true'
  } catch {
    return false
  }
}

export async function setSiteClosed(closed: boolean): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: closed ? 'true' : 'false' },
    create: { key: SETTING_KEY, value: closed ? 'true' : 'false' },
  })
}

/** Le visiteur courant (cookie de session) est-il un admin/manager actif ? */
export async function isStaffVisitor(): Promise<boolean> {
  try {
    const store = await cookies()
    const session = await verifySession(store.get(SESSION_COOKIE_NAME)?.value)
    if (!session) return false
    const user = await db.user.findUnique({
      where: { id: session.sub },
      select: { role: true, isActive: true },
    })
    return Boolean(
      user && user.isActive && user.role === session.role && (user.role === 'admin' || user.role === 'manager')
    )
  } catch {
    return false
  }
}
