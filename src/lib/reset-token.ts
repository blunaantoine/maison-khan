import { SignJWT, jwtVerify } from 'jose'
import { createHash } from 'crypto'
import { getSecret } from '@/lib/auth'

/**
 * Jeton de réinitialisation de mot de passe (sans stockage en base).
 * - signé HS256, durée de vie 30 min, usage distinct de la session (`purpose`)
 * - lié à l'empreinte du mot de passe actuel (`ph`) : dès que le mot de passe
 *   change, le lien devient invalide → usage unique.
 *
 * NB : module Node uniquement (crypto) — NE PAS l'importer depuis le
 * middleware (Edge Runtime). Seules les routes API auth/forgot-password et
 * auth/reset-password l'utilisent.
 */

export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 24)
}

export async function signResetToken(user: { id: string; password: string }): Promise<string> {
  return new SignJWT({ purpose: 'pwreset', ph: passwordFingerprint(user.password) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(getSecret())
}

export async function verifyResetToken(
  token: string
): Promise<{ userId: string; ph: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    if (payload.purpose !== 'pwreset' || !payload.sub || typeof payload.ph !== 'string') return null
    return { userId: payload.sub, ph: payload.ph }
  } catch {
    return null
  }
}
