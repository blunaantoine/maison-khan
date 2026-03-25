import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Secret pour sécuriser le webhook (à définir dans .env)
const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'maison-khan-deploy-2024'

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

    // Exécuter le script de déploiement en arrière-plan
    const deployScript = `
      cd /var/www/maison-khan && \
      cp db/custom.db db/custom.db.backup 2>/dev/null || true && \
      git fetch origin && \
      git reset --hard origin/master && \
      cp db/custom.db.backup db/custom.db 2>/dev/null || true && \
      bun install && \
      bun run db:generate && \
      bun run build && \
      pm2 restart maison-khan
    `

    // Lancer le déploiement sans attendre
    execAsync(deployScript).then(() => {
      console.log('✅ Déploiement terminé')
    }).catch((err) => {
      console.error('❌ Erreur de déploiement:', err)
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
