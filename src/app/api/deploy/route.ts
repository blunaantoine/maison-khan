import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Secret pour sécuriser le webhook (à définir dans .env)
const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'maison-khan-deploy-2024'

// Branche déployée par le webhook (défaut : la branche de fusion
// dashboard + mobile-money-integration — celle qui tourne en production)
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || 'fusion/dashboard+mmi'

export async function POST(request: NextRequest) {
  try {
    // Vérifier le secret dans les headers ou query params
    const authHeader = request.headers.get('authorization')
    const urlSecret = request.nextUrl.searchParams.get('secret')

    const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret

    if (providedSecret !== DEPLOY_SECRET) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    // Script de déploiement :
    //  1. pm2 stop AVANT le build (sinon le build et l'app se disputent la RAM
    //     → l'OOM Killer linux tue des processus au hasard → ERR_CONNECTION_REFUSED)
    //  2. Backup SQLite cohérent via `sqlite3 .backup` (un simple `cp` pendant
    //     des écritures produit un fichier corrompu)
    //  3. pm2 restart SEULEMENT si le build a réussi (sinon on garde l'ancien
    //     .next et on redémarre quand même l'app)
    const deployScript = `
      cd /var/www/maison-khan && \
      echo "[DEPLOY] $(date) — démarrage (${DEPLOY_BRANCH})" >> deploy-history.log && \
      pm2 stop maison-khan 2>/dev/null; \
      sqlite3 db/custom.db ".backup 'db/custom.db.backup'" 2>/dev/null || cp db/custom.db db/custom.db.backup 2>/dev/null || true; \
      git fetch origin && \
      git reset --hard origin/${DEPLOY_BRANCH} && \
      bun install && \
      bun run db:generate && \
      bun run build && \
      pm2 restart maison-khan && \
      echo "[DEPLOY] $(date) — SUCCÈS" >> deploy-history.log
    `

    // Lancer le déploiement sans attendre ; en cas d'échec, filet de sécurité :
    // on redémarre l'ancienne version plutôt que de laisser le site éteint.
    execAsync(deployScript).then(() => {
      console.log('✅ Déploiement terminé')
    }).catch(async (err) => {
      console.error('❌ Erreur de déploiement:', err)
      console.log('↩️ Redémarrage de l\'ancienne version...')
      await execAsync('cd /var/www/maison-khan && pm2 restart maison-khan 2>/dev/null; echo "[DEPLOY] $(date) — ÉCHEC: redémarrage ancienne version" >> deploy-history.log').catch(() => {})
    })

    return NextResponse.json({
      success: true,
      message: 'Déploiement lancé en arrière-plan'
    })

  } catch (error) {
    console.error('Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors du déploiement' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Vérifier le secret
  const urlSecret = request.nextUrl.searchParams.get('secret')

  if (urlSecret !== DEPLOY_SECRET) {
    return NextResponse.json(
      { error: 'Non autorisé' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    status: 'ok',
    message: 'API de déploiement MAISON KHAN',
    usage: 'POST /api/deploy?secret=VOTRE_SECRET'
  })
}
