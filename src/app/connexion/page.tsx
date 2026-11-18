import { redirect } from 'next/navigation'

/**
 * /connexion — adresse de connexion de l'équipe quand le site est fermé au
 * public (le formulaire est affiché par le layout, via SiteClosed). Site
 * ouvert, ou membre de l'équipe déjà connecté : retour à la boutique.
 */
export const metadata = { robots: { index: false, follow: false } }

export default function ConnexionPage() {
  redirect('/')
}
