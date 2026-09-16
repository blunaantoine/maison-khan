import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Secret pour sécuriser le webhook (obligatoire via env)
const DEPLOY_SECRET = process.env.DEPLOY_SECRET

// Branche déployée : configurable via DEPLOY_BRANCH, défaut = branche principale du dépôt
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || 'mobile-money-integration'

export async function POST(request: NextRequest) {
  try {
    if (!DEPLOY_SECRET) {
      console.error('[DEPLOY] DEPLOY_SECRET non configuré')
      return NextResponse.json(
        { error: 'Déploiement non configuré' },
        { status: 503 }
      )
    }

    // Vérifier le secret uniquement dans les headers
    const authHeader = request.headers.get('authorization')
    const providedSecret = authHeader?.replace('Bearer ', '')

    if (providedSecret !== DEPLOY_SECRET) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    // Journal de déploiement horodaté (PM2 capture déjà stdout/stderr)
    const logFile = `deploy-$(date +%Y%m%d-%H%M%S).log`

    /**
     * Correctifs appliqués (stabilité VPS) :
     * 1. pm2 stop AVANT le build — libère la RAM de l'app pendant `next build`
     *    (un build consomme 1-2 Go ; sinon l'OOM Killer tue mysqld/caddy au hasard)
     * 2. `sqlite3 .backup` — sauvegarde COHÉRENTE de la base (un simple `cp`
     *    pendant une écriture peut corrompre le fichier et écraser des commandes)
     * 3. Déploiement sur la bonne branche (mobile-money-integration = branche
     *    principale du dépôt, et non master qui est obsolète)
     * 4. pm2 restart avec --update-env en fin de script, uniquement si le build réussit
     */
    const deployScript = `
      set -o pipefail
      cd /var/www/maison-khan && \\
      echo "[DEPLOY] Démarrage $(date)" >> "deploy-history.log" && \\
      pm2 stop maison-khan && \\
      sqlite3 db/custom.db ".backup db/custom.db.backup" && \\
      git fetch origin && \\
      git reset --hard "origin/${DEPLOY_BRANCH}" && \\
      cp db/custom.db.backup db/custom.db && \\
      bun install && \\
      bun run db:generate && \\
      bun run build 2>&1 | tee "${logFile}" && \\
      pm2 restart maison-khan --update-env && \\
      echo "[DEPLOY] Terminé avec succès $(date)" >> "deploy-history.log"
    `

    // Lancer le déploiement sans attendre la réponse
    execAsync(deployScript)
      .then(() => console.log('✅ Déploiement terminé'))
      .catch((err) => {
        console.error('❌ Erreur de déploiement:', err)
        // Filet de sécurité : si le build échoue, on redémarre l'ancienne version
        execAsync('pm2 restart maison-khan').catch(() => {})
        execAsync(
          `echo "[DEPLOY] ÉCHEC: ${String(err.message).replace(/"/g, "'").slice(0, 300)} $(date)" >> /var/www/maison-khan/deploy-history.log`
        ).catch(() => {})
      })

    return NextResponse.json({
      success: true,
      message: 'Déploiement lancé en arrière-plan',
      branch: DEPLOY_BRANCH
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
  // Vérifier le secret via header uniquement
  const authHeader = request.headers.get('authorization')
  const providedSecret = authHeader?.replace('Bearer ', '')

  if (!DEPLOY_SECRET || providedSecret !== DEPLOY_SECRET) {
    return NextResponse.json(
      { error: 'Non autorisé' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    status: 'ok',
    message: 'API de déploiement MAISON KHAN',
    branch: DEPLOY_BRANCH,
    usage: 'POST /api/deploy avec header Authorization: Bearer VOTRE_SECRET'
  })
}
