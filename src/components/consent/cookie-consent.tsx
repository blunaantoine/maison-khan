'use client';

/**
 * MAISON KHAN — Bannière de consentement cookies + permissions de notifications.
 *
 * Comportement :
 * - Bannière fixe en bas de page (noir #0A0A0A, liseré doré) tant qu'aucun
 *   consentement n'est enregistré (cookie `mk_consent`).
 * - Dialogue de personnalisation (style modale du site : crème, bordures #E5E0DA).
 * - Après acceptation avec notifications : encart discret "Restez informé·e"
 *   (fond crème, bordure bronze) pour activer les notifications navigateur —
 *   la permission n'est JAMAIS demandée sans clic explicite.
 * - Une fois le choix enregistré (accepté OU refusé), la bannière disparaît
 *   définitivement — aucun bouton résiduel. Les réglages restent accessibles
 *   via le lien « Cookies & confidentialité » du pied de page, qui émet
 *   l'événement window `mk:open-cookie-settings`.
 *
 * Hydratation : le composant rend `null` jusqu'à l'hydratation client terminée
 * (hook `useMounted` via useSyncExternalStore — sans setState dans un effet),
 * donc le rendu serveur et le premier rendu client sont identiques.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getConsent,
  saveConsent,
  type ConsentSettings,
} from '@/lib/consent';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendBrowserNotification,
} from './notifications';

/** Clé localStorage mémorisant le refus de l'encart "Activer les notifications". */
const NOTIF_PROMPT_DISMISSED_KEY = 'mk_notif_prompt_dismissed';

/** Abonnement vide : on ne s'abonne à rien, on veut juste détecter l'hydratation. */
const emptySubscribe = () => () => {};

/**
 * `false` pendant le rendu serveur ET pendant l'hydratation, `true` ensuite.
 * Pattern recommandé (sans setState dans un effet) pour éviter tout mismatch.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/**
 * État initial de l'encart notifications : visible uniquement si l'utilisateur
 * a consenti aux notifications, n'a pas encore répondu au navigateur
 * (permission 'default') et n'a pas repoussé l'encart. SSR-safe (false).
 */
function readInitialNotifPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  const existing = getConsent();
  if (!existing?.notifications) return false;
  try {
    if (window.localStorage.getItem(NOTIF_PROMPT_DISMISSED_KEY) === 'true') {
      return false;
    }
  } catch {
    return false;
  }
  return getNotificationPermission() === 'default';
}

/* -------------------------------------------------------------------------- */
/*  Petit interrupteur rectangulaire (style éditorial MAISON KHAN)            */
/* -------------------------------------------------------------------------- */

interface ConsentToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

function ConsentToggle({ checked, onChange, disabled = false, label }: ConsentToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled && onChange) onChange(!checked);
      }}
      className={[
        'relative w-12 h-7 shrink-0 transition-colors duration-300',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9C7C5C]',
        checked ? 'bg-[#0A0A0A]' : 'bg-white border border-[#E5E0DA]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[#9C7C5C]',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all duration-300',
          checked ? 'left-[1.5rem] bg-[#C4A77D]' : 'left-1 bg-[#6B6560]',
        ].join(' ')}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Composant principal                                                       */
/* -------------------------------------------------------------------------- */

export default function CookieConsent() {
  const mounted = useMounted();
  // Initialiseurs paresseux SSR-safe : null/false côté serveur, valeur réelle côté client.
  const [consent, setConsent] = useState<ConsentSettings | null>(() => getConsent());
  const [analyticsChoice, setAnalyticsChoice] = useState(
    () => getConsent()?.analytics ?? false
  );
  const [notificationsChoice, setNotificationsChoice] = useState(
    () => getConsent()?.notifications ?? false
  );
  const [showCustomize, setShowCustomize] = useState(false);
  const [showNotifPrompt, setShowNotifPrompt] = useState(readInitialNotifPrompt);

  const dialogRef = useRef<HTMLDivElement>(null);
  /** Élément déclencheur du dialogue, pour lui rendre le focus à la fermeture. */
  const dialogTriggerRef = useRef<HTMLElement | null>(null);

  /* --- Actions --- */

  /** Affiche l'encart notifications si le contexte s'y prête. */
  const maybeShowNotifPrompt = (settings: ConsentSettings) => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(NOTIF_PROMPT_DISMISSED_KEY) === 'true';
    } catch {
      dismissed = false;
    }
    setShowNotifPrompt(
      settings.notifications &&
        !dismissed &&
        getNotificationPermission() === 'default'
    );
  };

  const handleAcceptAll = () => {
    const saved = saveConsent({ analytics: true, notifications: true });
    setConsent(saved);
    setAnalyticsChoice(true);
    setNotificationsChoice(true);
    maybeShowNotifPrompt(saved);
  };

  const handleRejectAll = () => {
    const saved = saveConsent({ analytics: false, notifications: false });
    setConsent(saved);
    setAnalyticsChoice(false);
    setNotificationsChoice(false);
    setShowNotifPrompt(false);
  };

  const handleSaveChoices = () => {
    const saved = saveConsent({
      analytics: analyticsChoice,
      notifications: notificationsChoice,
    });
    setConsent(saved);
    setShowCustomize(false);
    dialogTriggerRef.current?.focus();
    maybeShowNotifPrompt(saved);
  };

  const openCustomize = (trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    // Repartir des choix réellement enregistrés
    setAnalyticsChoice(consent?.analytics ?? false);
    setNotificationsChoice(consent?.notifications ?? false);
    setShowCustomize(true);
  };

  const closeCustomize = () => {
    setShowCustomize(false);
    dialogTriggerRef.current?.focus();
  };

  /** Clic sur "Activer les notifications" (geste utilisateur explicite). */
  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      sendBrowserNotification(
        'MAISON KHAN',
        'Notifications activées ! Vous serez alerté·e du suivi de vos commandes.'
      );
    }
    // Accordée ou refusée : dans les deux cas on n'insiste plus.
    setShowNotifPrompt(false);
  };

  /* --- Focus initial sur le dialogue ouvert --- */
  useEffect(() => {
    if (showCustomize && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [showCustomize]);

  /* --- Échap ferme le dialogue --- */
  useEffect(() => {
    if (!showCustomize) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCustomize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCustomize]);

  /* --- Lien « Cookies & confidentialité » du pied de page : ouvrir les réglages --- */
  useEffect(() => {
    const openFromFooter = () => {
      // Repartir des choix réellement enregistrés
      setAnalyticsChoice(getConsent()?.analytics ?? false);
      setNotificationsChoice(getConsent()?.notifications ?? false);
      setShowCustomize(true);
    };
    window.addEventListener('mk:open-cookie-settings', openFromFooter);
    return () => window.removeEventListener('mk:open-cookie-settings', openFromFooter);
  }, []);

  /** Clic sur "Plus tard" : mémoriser le refus pour ne plus déranger. */
  const handleNotifLater = () => {
    try {
      window.localStorage.setItem(NOTIF_PROMPT_DISMISSED_KEY, 'true');
    } catch {
      // localStorage indisponible : on se contente de masquer l'encart
    }
    setShowNotifPrompt(false);
  };

  /* --- Cycle de focus (Tab) à l'intérieur du dialogue --- */
  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* --- Rendu : rien côté serveur ni avant le mount (hydratation sûre) --- */
  if (!mounted) return null;

  const bannerVisible = consent === null;

  return (
    <>
      {/* ======================= BANNIÈRE ======================= */}
      {bannerVisible && (
        <section
          role="region"
          aria-label="Bandeau de consentement aux cookies"
          className="fixed bottom-0 inset-x-0 z-[90] p-4"
        >
          <div className="mx-auto w-full max-w-6xl bg-[#0A0A0A] text-[#F8F6F3] border-t-2 border-[#C4A77D] shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
              {/* Texte */}
              <div className="flex-1 min-w-0">
                <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-[#C4A77D] mb-3">
                  <span aria-hidden="true">🖱️</span>
                  Cookies &amp; Confidentialité
                </h2>
                <p className="text-sm leading-relaxed text-[#F8F6F3]/70">
                  Nous utilisons des cookies essentiels au fonctionnement de la boutique
                  (panier, connexion) ainsi que, avec votre accord, des notifications pour
                  le suivi de votre commande et des statistiques anonymes.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="min-h-[40px] px-6 py-3 bg-[#9C7C5C] text-[#F8F6F3] text-xs font-medium uppercase tracking-widest transition-colors duration-300 hover:bg-[#8B6B4B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A77D]"
                >
                  Tout accepter
                </button>
                <button
                  type="button"
                  onClick={(event) => openCustomize(event.currentTarget)}
                  className="min-h-[40px] px-6 py-3 border border-[#C4A77D]/60 text-[#F8F6F3] text-xs font-medium uppercase tracking-widest transition-colors duration-300 hover:border-[#C4A77D] hover:text-[#C4A77D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A77D]"
                >
                  Personnaliser
                </button>
                <button
                  type="button"
                  onClick={handleRejectAll}
                  className="min-h-[40px] px-6 py-3 text-[#F8F6F3]/60 hover:text-[#F8F6F3] text-xs font-medium uppercase tracking-widest underline underline-offset-4 decoration-[#F8F6F3]/30 hover:decoration-[#F8F6F3] transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A77D]"
                >
                  Tout refuser
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============== DIALOGUE DE PERSONNALISATION ============== */}
      {showCustomize && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]"
          onClick={closeCustomize}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Personnaliser vos préférences de confidentialité"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#F8F6F3] outline-none animate-in fade-in-0 zoom-in-95 duration-300"
          >
            <div className="p-6 sm:p-8">
              {/* En-tête */}
              <div className="flex items-start justify-between gap-4 pb-4 mb-2 border-b border-[#E5E0DA]">
                <h2
                  className="text-2xl font-light text-[#0A0A0A]"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Préférences de confidentialité
                </h2>
                <button
                  type="button"
                  onClick={closeCustomize}
                  aria-label="Fermer les préférences de confidentialité"
                  className="shrink-0 p-2 -m-1 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B6560] hover:text-[#0A0A0A] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9C7C5C]"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-[#6B6560] leading-relaxed mb-2">
                Choisissez ce que vous autorisez. Vous pourrez modifier ces réglages
                à tout moment via le lien « Cookies &amp; confidentialité » en pied de page.
              </p>

              {/* Réglages */}
              <div className="divide-y divide-[#E5E0DA]">
                {/* Essentiels */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#0A0A0A]">Essentiels</span>
                      <span className="text-[10px] uppercase tracking-widest text-[#6B6560] border border-[#E5E0DA] px-2 py-0.5">
                        Toujours actifs
                      </span>
                    </div>
                    <p className="text-xs text-[#6B6560] mt-1">
                      Requis pour le panier et la connexion
                    </p>
                  </div>
                  <ConsentToggle
                    checked
                    disabled
                    label="Cookies essentiels (toujours actifs)"
                  />
                </div>

                {/* Notifications */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-[#0A0A0A]">Notifications</span>
                    <p className="text-xs text-[#6B6560] mt-1">Alertes de suivi de commande</p>
                  </div>
                  <ConsentToggle
                    checked={notificationsChoice}
                    onChange={setNotificationsChoice}
                    label="Notifications de suivi de commande"
                  />
                </div>

                {/* Statistiques */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-[#0A0A0A]">Statistiques</span>
                    <p className="text-xs text-[#6B6560] mt-1">Mesure d&apos;audience anonyme</p>
                  </div>
                  <ConsentToggle
                    checked={analyticsChoice}
                    onChange={setAnalyticsChoice}
                    label="Statistiques de mesure d'audience anonyme"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleSaveChoices}
                  className="flex-1 min-h-[40px] py-3 bg-[#9C7C5C] text-[#F8F6F3] text-xs font-medium uppercase tracking-widest transition-colors duration-300 hover:bg-[#8B6B4B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9C7C5C]"
                >
                  Enregistrer mes choix
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="flex-1 min-h-[40px] py-3 border border-[#0A0A0A] text-[#0A0A0A] text-xs font-medium uppercase tracking-widest transition-colors duration-300 hover:bg-[#0A0A0A] hover:text-[#F8F6F3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9C7C5C]"
                >
                  Tout accepter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ ENCART "RESTEZ INFORMÉ·E" (notifications) ============ */}
      {showNotifPrompt && (
        <section
          role="region"
          aria-label="Activation des notifications"
          className="fixed bottom-0 inset-x-0 z-[90] p-4"
        >
          <div className="relative mx-auto w-full max-w-2xl bg-[#0A0A0A] text-[#F8F6F3] border border-[#C4A77D]/40 border-t-2 border-t-[#C4A77D] shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            {/* Fermeture discrète */}
            <button
              type="button"
              onClick={handleNotifLater}
              aria-label="Fermer et activer les notifications plus tard"
              className="absolute top-2 right-2 z-10 p-1.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#F8F6F3]/40 hover:text-[#C4A77D] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A77D]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-5 sm:p-6 sm:pl-7 flex flex-col sm:flex-row sm:items-center gap-5">
              {/* Cloche dans un halo doré pulsant */}
              <div className="relative shrink-0 mx-auto sm:mx-0">
                <span
                  aria-hidden="true"
                  className="absolute -inset-1.5 rounded-full bg-[#C4A77D]/20 animate-ping [animation-duration:3s]"
                />
                <span className="relative w-12 h-12 rounded-full border border-[#C4A77D]/70 flex items-center justify-center bg-[#0A0A0A]">
                  <svg
                    className="w-5 h-5 text-[#C4A77D]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.9 5.6a3 3 0 0 0-5.8 0M18 8.5c0 5.5 2 8.5 2 8.5H4s2-3 2-8.5a6 6 0 0 1 12 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 20a2 2 0 0 0 3.4 0" />
                  </svg>
                </span>
              </div>

              {/* Texte */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#C4A77D] mb-1">
                  Suivi de commande
                </p>
                <h3
                  className="text-xl sm:text-2xl font-light text-[#F8F6F3]"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Restez informé·e
                </h3>
                <p className="text-xs text-[#F8F6F3]/60 mt-1.5 leading-relaxed">
                  Une notification discrète à chaque étape de votre commande —
                  de la confirmation à la livraison.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2.5 shrink-0 w-full sm:w-auto sm:min-w-[190px]">
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  className="min-h-[40px] px-6 py-3 bg-[#C4A77D] text-[#0A0A0A] text-xs font-semibold uppercase tracking-widest transition-colors duration-300 hover:bg-[#D9BC8F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A77D]"
                >
                  Activer
                </button>
                <button
                  type="button"
                  onClick={handleNotifLater}
                  className="min-h-[40px] py-2 text-[#F8F6F3]/50 hover:text-[#F8F6F3] text-xs font-medium uppercase tracking-widest underline underline-offset-4 decoration-[#C4A77D]/40 hover:decoration-[#C4A77D] transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A77D]"
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

    </>
  );
}
