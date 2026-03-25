'use client'

import { useState, useEffect, useRef, useMemo, useCallback, memo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'

// Auth Form Component - Separate to prevent re-renders
interface AuthFormProps {
  mode: 'login' | 'register'
  onSubmit: (data: { email: string; password: string; firstName?: string; lastName?: string; phone?: string }) => void
  onForgotPassword: (email: string) => void
  onSwitchMode: () => void
  showPassword: boolean
  onTogglePassword: () => void
  forgotPasswordLoading: boolean
}

// Checkout Form Component - Separate to prevent re-renders
interface CheckoutFormProps {
  checkoutStep: 'info' | 'shipping' | 'payment'
  setCheckoutStep: (step: 'info' | 'shipping' | 'payment') => void
  onDirectCheckout: () => void
  onPayGateCheckout: (network: 'FLOOZ' | 'TMONEY') => void
  payGateLoading: boolean
  formatPrice: (price: number) => string
  orderItems: { name: string; size: string; colorName?: string; price: number; qty: number }[]
  subtotal: number
  user?: { email?: string; phone?: string; firstName?: string; lastName?: string } | null
}

export interface CheckoutFormRef {
  getFormData: () => {
    email: string
    phone: string
    firstName: string
    lastName: string
    city: string
    address: string
    latitude: number | null
    longitude: number | null
  }
}

const CheckoutForm = memo(forwardRef<CheckoutFormRef, CheckoutFormProps>(function CheckoutForm({
  checkoutStep,
  setCheckoutStep,
  onDirectCheckout,
  onPayGateCheckout,
  payGateLoading,
  formatPrice,
  orderItems,
  subtotal,
  user
}, ref) {
  const emailRef = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const cityRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLTextAreaElement>(null)
  const [location, setLocation] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null })
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  // Store phone in state to persist across steps
  const [phone, setPhone] = useState(user?.phone || '')

  const total = subtotal

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n'est pas supportée par votre navigateur")
      return
    }

    setIsGettingLocation(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setLocation({ latitude, longitude })
        setIsGettingLocation(false)
        
        // Pré-remplir l'adresse avec les coordonnées
        if (addressRef.current && !addressRef.current.value) {
          addressRef.current.value = `Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`
        }
      },
      (error) => {
        setIsGettingLocation(false)
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Permission de géolocalisation refusée")
            break
          case error.POSITION_UNAVAILABLE:
            setLocationError("Position non disponible")
            break
          case error.TIMEOUT:
            setLocationError("Délai d'attente dépassé")
            break
          default:
            setLocationError("Erreur de géolocalisation")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Expose getFormData function to parent
  useImperativeHandle(ref, () => ({
    getFormData: () => {
      const data = {
        email: emailRef.current?.value || '',
        phone: phone,
        firstName: firstNameRef.current?.value || '',
        lastName: lastNameRef.current?.value || '',
        city: cityRef.current?.value || '',
        address: addressRef.current?.value || '',
        latitude: location.latitude,
        longitude: location.longitude
      }
      console.log('📋 getFormData called:', data)
      return data
    }
  }), [location, phone])

  return (
    <>
      {checkoutStep === 'info' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-4">Vos informations</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              ref={emailRef}
              type="email"
              name="checkout-email"
              placeholder="Email *"
              required
              autoComplete="email"
              defaultValue={user?.email || ''}
              className="p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
            />
            <input
              type="tel"
              name="checkout-phone"
              placeholder="Numéro de téléphone *"
              required
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
            />
            <input
              ref={firstNameRef}
              type="text"
              name="checkout-firstName"
              placeholder="Prénom"
              autoComplete="given-name"
              defaultValue={user?.firstName || ''}
              className="p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
            />
            <input
              ref={lastNameRef}
              type="text"
              name="checkout-lastName"
              placeholder="Nom"
              autoComplete="family-name"
              defaultValue={user?.lastName || ''}
              className="p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
            />
          </div>
          <button
            onClick={() => setCheckoutStep('shipping')}
            className="w-full bg-[#9C7C5C] text-white py-3 uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
          >
            Continuer
          </button>
        </div>
      )}

      {checkoutStep === 'shipping' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-4">Adresse de livraison</h3>
          
          {/* Bouton géolocalisation */}
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isGettingLocation}
            className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[#9C7C5C] text-[#9C7C5C] hover:bg-[#9C7C5C]/10 transition-colors disabled:opacity-50"
          >
            {isGettingLocation ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Récupération de la position...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Utiliser ma position GPS</span>
              </>
            )}
          </button>
          
          {locationError && (
            <p className="text-red-500 text-sm text-center">{locationError}</p>
          )}
          
          {location.latitude && location.longitude && (
            <div className="bg-green-50 border border-green-200 p-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-700 text-sm">
                Position détectée: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </span>
            </div>
          )}
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E5E0DA]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#F8F6F3] text-[#6B6560]">ou entrez manuellement</span>
            </div>
          </div>
          
          <input
            ref={cityRef}
            type="text"
            name="city"
            placeholder="Ville *"
            required
            autoComplete="address-level2"
            className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
          />
          <textarea
            ref={addressRef}
            name="address"
            placeholder="Adresse complète *"
            required
            autoComplete="street-address"
            className="w-full p-3 border border-[#E5E0DA] h-24 focus:outline-none focus:border-[#9C7C5C]"
          />
          <div className="flex gap-4">
            <button
              onClick={() => setCheckoutStep('info')}
              className="flex-1 border border-[#E5E0DA] py-3 uppercase tracking-wider hover:bg-[#EDE8E1] transition-colors"
            >
              Retour
            </button>
            <button
              onClick={() => setCheckoutStep('payment')}
              className="flex-1 bg-[#9C7C5C] text-white py-3 uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {checkoutStep === 'payment' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-4">Récapitulatif</h3>
          
          <div className="bg-[#EDE8E1] p-4 space-y-2">
            {orderItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.name} - {item.size}{item.colorName ? ` (${item.colorName})` : ''} x{item.qty}</span>
                <span>{formatPrice(item.price * item.qty)}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between font-medium text-lg border-t border-[#E5E0DA] pt-4">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>

          <p className="text-center text-sm text-[#6B6560] pt-4">Choisissez votre mode de paiement Mobile Money</p>

          <div className="space-y-3">
            {/* Moov Money (FLOOZ) - First */}
            <button
              onClick={() => onPayGateCheckout('FLOOZ')}
              disabled={payGateLoading}
              className="w-full bg-[#FF6600] text-white py-3 uppercase tracking-wider hover:bg-[#E65C00] transition-colors flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {payGateLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Traitement...</span>
                </>
              ) : (
                <>
                  <img src="/moov-money.png" alt="Moov Money" className="h-8 w-auto bg-white rounded p-1" />
                  <span>Moov Money {formatPrice(total)}</span>
                </>
              )}
            </button>
            
            {/* T-Money (TMONEY) - Second */}
            <button
              onClick={() => onPayGateCheckout('TMONEY')}
              disabled={payGateLoading}
              className="w-full bg-[#003399] text-white py-3 uppercase tracking-wider hover:bg-[#002266] transition-colors flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {payGateLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Traitement...</span>
                </>
              ) : (
                <>
                  <img src="/mixx-by-yas.png" alt="T-Money Togocel" className="h-8 w-auto bg-white rounded p-1" />
                  <span>T-Money {formatPrice(total)}</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-[#EDE8E1] p-4 text-sm space-y-2">
            <p className="font-medium mb-2">ℹ️ Modes de paiement</p>
            <div className="space-y-1 text-[#6B6560]">
              <p><strong>Moov Money:</strong> Paiement Mobile Money Moov instantané.</p>
              <p><strong>T-Money:</strong> Paiement Mobile Money Togocel instantané.</p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setCheckoutStep('shipping')}
              className="flex-1 border border-[#E5E0DA] py-3 uppercase tracking-wider hover:bg-[#EDE8E1] transition-colors"
            >
              Retour
            </button>
          </div>
        </div>
      )}
    </>
  )
}))

const AuthForm = memo(function AuthForm({ 
  mode, 
  onSubmit, 
  onForgotPassword, 
  onSwitchMode, 
  showPassword, 
  onTogglePassword,
  forgotPasswordLoading 
}: AuthFormProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const [phonePrefix, setPhonePrefix] = useState('+228')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      email: emailRef.current?.value || '',
      password: passwordRef.current?.value || '',
      firstName: firstNameRef.current?.value,
      lastName: lastNameRef.current?.value,
      phone: phonePrefix + ' ' + (phoneRef.current?.value || '')
    }
    onSubmit(data)
  }

  const handleForgotPassword = () => {
    onForgotPassword(emailRef.current?.value || '')
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div className="grid grid-cols-2 gap-4">
            <input
              ref={firstNameRef}
              type="text"
              name="firstName"
              placeholder="Prénom"
              autoComplete="given-name"
              className="w-full p-3 border border-[#E5E0DA] bg-white"
            />
            <input
              ref={lastNameRef}
              type="text"
              name="lastName"
              placeholder="Nom"
              autoComplete="family-name"
              className="w-full p-3 border border-[#E5E0DA] bg-white"
            />
          </div>
        )}
        <input
          ref={emailRef}
          type="email"
          name="email"
          placeholder="Email"
          required
          autoComplete="email"
          className="w-full p-3 border border-[#E5E0DA] bg-white"
        />
        <div className="relative">
          <input
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Mot de passe"
            required
            autoComplete="current-password"
            className="w-full p-3 pr-12 border border-[#E5E0DA] bg-white"
          />
          <button 
            type="button"
            onClick={onTogglePassword} 
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6560] hover:text-[#0A0A0A] transition-colors"
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {mode === 'register' && (
          <div className="flex overflow-hidden">
            <select
              value={phonePrefix}
              onChange={(e) => setPhonePrefix(e.target.value)}
              className="p-3 border border-r-0 border-[#E5E0DA] bg-white focus:outline-none focus:border-[#9C7C5C] text-sm w-[140px] shrink-0 truncate"
              style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif' }}
            >
              {/* Afrique de l'Ouest */}
              <option value="+228">🇹🇬 Togo (+228)</option>
              <option value="+229">🇧🇯 Bénin (+229)</option>
              <option value="+226">🇧🇫 Burkina Faso (+226)</option>
              <option value="+227">🇳🇪 Niger (+227)</option>
              <option value="+221">🇸🇳 Sénégal (+221)</option>
              <option value="+225">🇨🇮 Côte d'Ivoire (+225)</option>
              <option value="+223">🇲🇱 Mali (+223)</option>
              <option value="+224">🇬🇳 Guinée (+224)</option>
              <option value="+245">🇬🇼 Guinée-Bissau (+245)</option>
              <option value="+233">🇬🇭 Ghana (+233)</option>
              <option value="+234">🇳🇬 Nigeria (+234)</option>
              {/* Afrique Centrale */}
              <option value="+237">🇨🇲 Cameroun (+237)</option>
              <option value="+241">🇬🇦 Gabon (+241)</option>
              <option value="+242">🇨🇬 Congo (+242)</option>
              <option value="+243">🇨🇩 RD Congo (+243)</option>
              <option value="+236">🇨🇫 Centrafrique (+236)</option>
              <option value="+235">🇹🇩 Tchad (+235)</option>
              {/* Afrique de l'Est */}
              <option value="+254">🇰🇪 Kenya (+254)</option>
              <option value="+255">🇹🇿 Tanzanie (+255)</option>
              <option value="+256">🇺🇬 Ouganda (+256)</option>
              <option value="+250">🇷🇼 Rwanda (+250)</option>
              <option value="+257">🇧🇮 Burundi (+257)</option>
              <option value="+251">🇪🇹 Éthiopie (+251)</option>
              <option value="+252">🇸🇴 Somalie (+252)</option>
              <option value="+253">🇩🇯 Djibouti (+253)</option>
              <option value="+211">🇸🇸 Soudan du Sud (+211)</option>
              <option value="+249">🇸🇩 Soudan (+249)</option>
              {/* Afrique du Nord */}
              <option value="+212">🇲🇦 Maroc (+212)</option>
              <option value="+213">🇩🇿 Algérie (+213)</option>
              <option value="+216">🇹🇳 Tunisie (+216)</option>
              <option value="+218">🇱🇾 Libye (+218)</option>
              <option value="+20">🇪🇬 Égypte (+20)</option>
              {/* Afrique Australe */}
              <option value="+27">🇿🇦 Afrique du Sud (+27)</option>
              <option value="+263">🇿🇼 Zimbabwe (+263)</option>
              <option value="+260">🇿🇲 Zambie (+260)</option>
              <option value="+265">🇲🇼 Malawi (+265)</option>
              <option value="+258">🇲🇿 Mozambique (+258)</option>
              <option value="+267">🇧🇼 Botswana (+267)</option>
              <option value="+268">🇸🇿 Eswatini (+268)</option>
              <option value="+264">🇳🇦 Namibie (+264)</option>
              <option value="+230">🇲🇺 Maurice (+230)</option>
              {/* Europe */}
              <option value="+33">🇫🇷 France (+33)</option>
              <option value="+32">🇧🇪 Belgique (+32)</option>
              <option value="+41">🇨🇭 Suisse (+41)</option>
              <option value="+39">🇮🇹 Italie (+39)</option>
              <option value="+34">🇪🇸 Espagne (+34)</option>
              <option value="+351">🇵🇹 Portugal (+351)</option>
              <option value="+49">🇩🇪 Allemagne (+49)</option>
              <option value="+44">🇬🇧 Royaume-Uni (+44)</option>
              <option value="+31">🇳🇱 Pays-Bas (+31)</option>
              <option value="+46">🇸🇪 Suède (+46)</option>
              <option value="+47">🇳🇴 Norvège (+47)</option>
              <option value="+45">🇩🇰 Danemark (+45)</option>
              <option value="+358">🇫🇮 Finlande (+358)</option>
              <option value="+48">🇵🇱 Pologne (+48)</option>
              <option value="+7">🇷🇺 Russie (+7)</option>
              <option value="+380">🇺🇦 Ukraine (+380)</option>
              <option value="+30">🇬🇷 Grèce (+30)</option>
              <option value="+352">🇱🇺 Luxembourg (+352)</option>
              <option value="+356">🇲🇹 Malte (+356)</option>
              <option value="+353">🇮🇪 Irlande (+353)</option>
              <option value="+43">🇦🇹 Autriche (+43)</option>
              <option value="+420">🇨🇿 Tchéquie (+420)</option>
              <option value="+36">🇭🇺 Hongrie (+36)</option>
              <option value="+40">🇷🇴 Roumanie (+40)</option>
              {/* Amérique du Nord */}
              <option value="+1">🇺🇸 USA / Canada (+1)</option>
              <option value="+52">🇲🇽 Mexique (+52)</option>
              {/* Amérique Centrale & Caraïbes */}
              <option value="+509">🇭🇹 Haïti (+509)</option>
              <option value="+1">🇵🇷 Porto Rico (+1)</option>
              <option value="+502">🇬🇹 Guatemala (+502)</option>
              <option value="+503">🇸🇻 Salvador (+503)</option>
              <option value="+504">🇭🇳 Honduras (+504)</option>
              <option value="+505">🇳🇮 Nicaragua (+505)</option>
              <option value="+506">🇨🇷 Costa Rica (+506)</option>
              <option value="+507">🇵🇦 Panama (+507)</option>
              <option value="+599">🇨🇼 Curaçao (+599)</option>
              {/* Amérique du Sud */}
              <option value="+55">🇧🇷 Brésil (+55)</option>
              <option value="+54">🇦🇷 Argentine (+54)</option>
              <option value="+56">🇨🇱 Chili (+56)</option>
              <option value="+57">🇨🇴 Colombie (+57)</option>
              <option value="+58">🇻🇪 Venezuela (+58)</option>
              <option value="+51">🇵🇪 Pérou (+51)</option>
              <option value="+591">🇧🇴 Bolivie (+591)</option>
              <option value="+598">🇺🇾 Uruguay (+598)</option>
              <option value="+593">🇪🇨 Équateur (+593)</option>
              <option value="+594">🇬🇾 Guyane (+594)</option>
              {/* Asie */}
              <option value="+86">🇨🇳 Chine (+86)</option>
              <option value="+91">🇮🇳 Inde (+91)</option>
              <option value="+81">🇯🇵 Japon (+81)</option>
              <option value="+82">🇰🇷 Corée du Sud (+82)</option>
              <option value="+66">🇹🇭 Thaïlande (+66)</option>
              <option value="+84">🇻🇳 Vietnam (+84)</option>
              <option value="+62">🇮🇩 Indonésie (+62)</option>
              <option value="+63">🇵🇭 Philippines (+63)</option>
              <option value="+60">🇲🇾 Malaisie (+60)</option>
              <option value="+65">🇸🇬 Singapour (+65)</option>
              <option value="+880">🇧🇩 Bangladesh (+880)</option>
              <option value="+92">🇵🇰 Pakistan (+92)</option>
              <option value="+98">🇮🇷 Iran (+98)</option>
              <option value="+964">🇮🇶 Irak (+964)</option>
              <option value="+966">🇸🇦 Arabie Saoudite (+966)</option>
              <option value="+971">🇦🇪 Émirats Arabes Unis (+971)</option>
              <option value="+972">🇮🇱 Israël (+972)</option>
              <option value="+90">🇹🇷 Turquie (+90)</option>
              <option value="+961">🇱🇧 Liban (+961)</option>
              <option value="+962">🇯🇴 Jordanie (+962)</option>
              <option value="+968">🇴🇲 Oman (+968)</option>
              <option value="+974">🇶🇦 Qatar (+974)</option>
              <option value="+973">🇧🇭 Bahreïn (+973)</option>
              <option value="+965">🇰🇼 Koweït (+965)</option>
              {/* Océanie */}
              <option value="+61">🇦🇺 Australie (+61)</option>
              <option value="+64">🇳🇿 Nouvelle-Zélande (+64)</option>
              <option value="+679">🇫🇯 Fidji (+679)</option>
            </select>
            <input
              ref={phoneRef}
              type="tel"
              name="phone"
              placeholder="Numéro de téléphone"
              autoComplete="tel"
              className="flex-1 min-w-0 p-3 border border-[#E5E0DA] bg-white focus:outline-none focus:border-[#9C7C5C]"
            />
          </div>
        )}
        <button type="submit" className="w-full bg-[#9C7C5C] text-white py-3 uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors">
          {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>
      
      {/* Mot de passe oublié */}
      {mode === 'login' && (
        <div className="mt-3 text-center">
          <button
            onClick={handleForgotPassword}
            disabled={forgotPasswordLoading}
            className="text-[#9C7C5C] hover:text-[#8B6B4B] text-sm underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {forgotPasswordLoading ? 'Envoi en cours...' : 'Mot de passe oublié ?'}
          </button>
        </div>
      )}
      
      <div className="mt-4 text-center">
        <button
          onClick={onSwitchMode}
          className="text-[#6B6560] hover:text-[#0A0A0A] text-sm"
        >
          {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </>
  )
})

// Types
interface ColorSize {
  size: string
  price: number
  stock: number
}

interface ProductColor {
  id: string
  productId: string
  colorName: string
  colorValue: string
  images: string[]
  sizes: ColorSize[]
  order: number
}

interface Product {
  id: string
  name: string
  category: string
  subCategory: string | null
  genre: string
  description: string | null
  image: string
  sizes: string[]
  type: string
  isActive: boolean
  isBestSeller: boolean
  isNew: boolean
  minPrice: number
  totalStock: number
  colors: ProductColor[]
}

interface MenuCategory {
  id: string
  name: string
  slug: string
  subCategories: SubCategory[]
}

interface SubCategory {
  id: string
  name: string
  slug: string
  genre: string
  images: MenuImage[]
}

interface MenuImage {
  id: string
  image: string
  title: string | null
  link: string | null
}

interface HeroSlide {
  id: string
  image: string
  type: string
  title: string | null
  subtitle: string | null
  link: string | null
  interval: number
  isActive: boolean
}

interface CartItem {
  id: string
  name: string
  price: number
  size: string
  color: string
  colorName: string
  qty: number
  image?: string
}

interface SiteContent {
  id: string
  key: string
  value: string
  description: string | null
  category: string
}

interface ToastMessage {
  id: number
  title: string
  description: string
  type: 'success' | 'error'
}

interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  role: string
  isActive?: boolean
  addresses?: Address[]
}

interface Address {
  id: string
  label: string
  firstName: string
  lastName: string
  phone: string
  country: string
  city: string
  address: string
  postalCode: string | null
  isDefault: boolean
}

interface Order {
  id: string
  orderNumber: string
  customerEmail: string
  customerPhone: string
  customerFirstName: string | null
  customerLastName: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingCountry: string | null
  subtotal: number
  shippingCost: number
  total: number
  status: string
  paymentStatus: string
  paymentMethod: string | null
  trackingNumber: string | null
  notes: string | null
  estimatedDelivery: string | null
  createdAt: string
  items: OrderItem[]
  payments?: Payment[]
}

interface OrderItem {
  id: string
  productName: string
  productImage: string | null
  colorName: string | null
  size: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface Payment {
  id: string
  amount: number
  status: string
  paymentMethod: string | null
  transactionId: string | null
  createdAt: string
}

// Helper function to format price
const formatPrice = (price: number | undefined | null) => {
  if (price === undefined || price === null || isNaN(price)) {
    return 'Prix sur demande'
  }
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " XOF"
}

// Helper function - returns hex color directly (with validation)
const getColorHex = (colorValue: string) => {
  if (!colorValue) return '#8B7355'
  // If already a valid hex, return it
  if (/^#[0-9A-Fa-f]{6}$/.test(colorValue)) return colorValue
  // Legacy support for old color names
  const legacyMap: Record<string, string> = {
    'noir': '#1a1a1a', 'blanc': '#FAFAFA', 'gris': '#6B6560', 'argent': '#A8A8A8',
    'or': '#C4A77D', 'marron': '#6F4E37', 'beige': '#E8DCC8', 'creme': '#FFF8E7',
    'ivoire': '#FFFFF0', 'camel': '#C19A6B', 'fauve': '#B87333', 'chocolat': '#4E2A1E',
    'taupe': '#8B8589', 'kaki': '#5C6B4A', 'vert': '#4A5D4A', 'bleu-marine': '#1E3A5F',
    'rouge': '#8B3A3A', 'bordeaux': '#5C1A1A', 'rose': '#C9A9A6', 'violet': '#6B4C6B',
    'jaune': '#C9A962', 'orange': '#B86B4A'
  }
  return legacyMap[colorValue] || '#8B7355'
}

// Display color for UI (returns valid hex or default)
const getDisplayColor = (colorValue: string) => {
  if (!colorValue) return null
  if (/^#[0-9A-Fa-f]{6}$/.test(colorValue)) return colorValue
  return getColorHex(colorValue)
}

// Sizes
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48']
const ACCESSORY_SIZES = ['Unique', 'S', 'M', 'L', 'XL']

// Compress image function
const compressImage = (file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality)
        resolve(compressedBase64)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export default function Home() {
  // State
  const [currentSection, setCurrentSection] = useState('home')
  const [products, setProducts] = useState<Product[]>([])
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([])
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [currentFilter, setCurrentFilter] = useState('all')
  const [currentGenre, setCurrentGenre] = useState('all')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [expandedMobileCategory, setExpandedMobileCategory] = useState<string | null>(null)
  const [mobileMenuGenre, setMobileMenuGenre] = useState<'homme' | 'femme' | 'mixte'>('femme')
  const [activeMegaMenu, setActiveMegaMenu] = useState<string | null>(null)
  const [megaMenuGenre, setMegaMenuGenre] = useState<'homme' | 'femme' | 'mixte'>('femme')
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showCartModal, setShowCartModal] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [showProductFormModal, setShowProductFormModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [logo, setLogo] = useState<string | null>(null)
  const [maisonImage, setMaisonImage] = useState<string | null>(null)
  const [formType, setFormType] = useState<'chaussure' | 'accessoire'>('chaussure')
  const [isLoading, setIsLoading] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const [videoPlaying, setVideoPlaying] = useState(true)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminTab, setAdminTab] = useState<'products' | 'orders' | 'users' | 'settings'>('products')
  const [adminOrders, setAdminOrders] = useState<Order[]>([])
  const [adminOrderFilter, setAdminOrderFilter] = useState<string>('all')
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [siteContent, setSiteContent] = useState<SiteContent[]>([])
  const [mounted, setMounted] = useState(false)
  
  // Set mounted on client side
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Admin Users State
  const [adminUsers, setAdminUsers] = useState<User[]>([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'customer'
  })
  
  // User & Auth State
  const [user, setUser] = useState<User | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  
  // Dashboard State
  const [showUserDashboard, setShowUserDashboard] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<string>('orders')
  const [userOrders, setUserOrders] = useState<Order[]>([])
  const [userAddresses, setUserAddresses] = useState<Address[]>([])
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  
  // Checkout State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<'info' | 'shipping' | 'payment'>('info')
  const checkoutFormRef = useRef<CheckoutFormRef>(null)
  const [payGateLoading, setPayGateLoading] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [pendingNetwork, setPendingNetwork] = useState<'FLOOZ' | 'TMONEY' | null>(null)
  const [paymentPhone, setPaymentPhone] = useState('')
  const [directOrder, setDirectOrder] = useState<{
    product: Product
    size: string
    colorName: string
    colorValue: string
    price: number
    quantity: number
  } | null>(null)
  
  // Product modal - selected color
  const [selectedColorValue, setSelectedColorValue] = useState<string | null>(null)
  
  // Form state - simplified
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subCategory: '',
    genre: 'femme' as 'homme' | 'femme' | 'mixte',
    description: '',
    sizes: [] as string[],
    type: 'chaussure' as 'chaussure' | 'accessoire',
    isBestSeller: false,
    isNew: true,
    colors: [] as ProductColor[]
  })
  
  // New color being added
  const [newColor, setNewColor] = useState<{
    colorName: string
    colorValue: string
    images: string[]
    sizes: ColorSize[]
  } | null>(null)
  
  // Index of color being edited (-1 = new color, >= 0 = editing existing)
  const [editingColorIndex, setEditingColorIndex] = useState<number>(-1)
  
  // Subcategory modal state
  const [showSubCatModal, setShowSubCatModal] = useState(false)
  const [editingSubCat, setEditingSubCat] = useState<{id: string | null, name: string, genre: string, menuCategoryId: string}>({
    id: null,
    name: '',
    genre: 'all',
    menuCategoryId: ''
  })
  
  const slideIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const megaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const whatsappNumber = '22870166767'

  // Toast function
  const showToast = (title: string, description: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, title, description, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  // Get content by key
  const getContent = (key: string, defaultValue: string = ''): string => {
    const content = siteContent.find(c => c.key === key)
    return content?.value || defaultValue
  }

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showToast('Erreur', 'Veuillez remplir tous les champs', 'error')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('Erreur', 'Les mots de passe ne correspondent pas', 'error')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      showToast('Erreur', 'Le mot de passe doit contenir au moins 6 caractères', 'error')
      return
    }
    
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })
      const data = await res.json()
      
      if (res.ok) {
        showToast('Succès', 'Mot de passe modifié avec succès')
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      } else {
        showToast('Erreur', data.error || 'Erreur lors du changement de mot de passe', 'error')
      }
    } catch {
      showToast('Erreur', 'Erreur lors du changement de mot de passe', 'error')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
    setShowUserDashboard(false)
    showToast('Déconnexion', 'À bientôt !')
  }

  // Load user from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        setUser(JSON.parse(savedUser))
      }
    } catch {
      // Ignore errors
    }
  }, [])

  // Fetch user orders
  const fetchUserOrders = async () => {
    if (!user) return
    try {
      const res = await fetch('/api/orders', {
        headers: { 'x-user-id': user.id }
      })
      if (res.ok) {
        const data = await res.json()
        setUserOrders(data.orders || [])
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  // Fetch user addresses
  const fetchUserAddresses = async () => {
    if (!user) return
    try {
      const res = await fetch('/api/addresses', {
        headers: { 'x-user-id': user.id }
      })
      if (res.ok) {
        const data = await res.json()
        setUserAddresses(data.addresses || [])
      }
    } catch (error) {
      console.error('Error fetching addresses:', error)
    }
  }

  useEffect(() => {
    if (showUserDashboard && user?.id) {
      fetchUserOrders()
      fetchUserAddresses()
    }
  }, [showUserDashboard, user?.id])

  // Fetch admin orders
  const fetchAdminOrders = async () => {
    try {
      const res = await fetch('/api/admin/orders', {
        headers: { 
          'x-user-id': user?.id || '',
          'x-is-admin': 'true'
        }
      })
      if (res.ok) {
        const data = await res.json()
        setAdminOrders(data.orders || [])
      }
    } catch (error) {
      console.error('Error fetching admin orders:', error)
    }
  }

  useEffect(() => {
    if (currentSection === 'admin' && (user?.role === 'admin' || user?.role === 'manager')) {
      fetchAdminOrders()
      if (user?.role === 'admin') {
        fetchAdminUsers()
      }
    }
  }, [currentSection, user?.role])

  // Update order status
  const updateOrderStatus = async (orderId: string, status: string, trackingNumber?: string) => {
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
          'x-is-admin': 'true'
        },
        body: JSON.stringify({ id: orderId, status, trackingNumber })
      })
      if (res.ok) {
        fetchAdminOrders()
        showToast('Succès', 'Commande mise à jour')
        setEditingOrder(null)
      } else {
        showToast('Erreur', 'Erreur lors de la mise à jour', 'error')
      }
    } catch (error) {
      showToast('Erreur', 'Erreur lors de la mise à jour', 'error')
    }
  }

  // Fetch admin users (admin only)
  const fetchAdminUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 
          'x-user-id': user?.id || ''
        }
      })
      if (res.ok) {
        const data = await res.json()
        setAdminUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  // Create user (admin only)
  const handleCreateUser = async () => {
    if (!newUserData.email || !newUserData.password) {
      showToast('Erreur', 'Email et mot de passe requis', 'error')
      return
    }
    
    // Debug: vérifier si l'utilisateur est bien chargé
    console.log('Creating user with admin id:', user?.id, 'role:', user?.role)
    
    if (!user?.id) {
      showToast('Erreur', 'Session expirée, veuillez vous reconnecter', 'error')
      return
    }
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify(newUserData)
      })
      if (res.ok) {
        fetchAdminUsers()
        setShowUserForm(false)
        setNewUserData({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'customer' })
        showToast('Succès', 'Utilisateur créé avec succès')
      } else {
        const data = await res.json()
        console.error('Create user error:', data)
        showToast('Erreur', data.error || 'Erreur lors de la création', 'error')
      }
    } catch (error) {
      console.error('Create user error:', error)
      showToast('Erreur', 'Erreur lors de la création', 'error')
    }
  }

  // Update user role/status (admin only)
  const handleUpdateUser = async (userId: string, updates: { role?: string; isActive?: boolean }) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user?.id || ''
        },
        body: JSON.stringify({ id: userId, ...updates })
      })
      if (res.ok) {
        fetchAdminUsers()
        showToast('Succès', 'Utilisateur mis à jour')
      } else {
        showToast('Erreur', 'Erreur lors de la mise à jour', 'error')
      }
    } catch {
      showToast('Erreur', 'Erreur lors de la mise à jour', 'error')
    }
  }

  // Delete user (admin only)
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) return
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': user?.id || '' }
      })
      if (res.ok) {
        fetchAdminUsers()
        showToast('Succès', 'Utilisateur supprimé')
      } else {
        const data = await res.json()
        showToast('Erreur', data.error || 'Erreur lors de la suppression', 'error')
      }
    } catch {
      showToast('Erreur', 'Erreur lors de la suppression', 'error')
    }
  }

  // Checkout with PayGate
  const handlePayGateCheckout = async (network: 'FLOOZ' | 'TMONEY') => {
    const formData = checkoutFormRef.current?.getFormData()
    
    // If no phone in form, show modal to ask for it
    if (!formData?.phone || formData.phone.trim() === '') {
      setPendingNetwork(network)
      setShowPhoneModal(true)
      return
    }
    
    // Proceed with payment using phone from form
    await executePayGatePayment(network, formData.phone)
  }

  // Execute PayGate payment with phone number
  const executePayGatePayment = async (network: 'FLOOZ' | 'TMONEY', phoneNumber: string) => {
    const formData = checkoutFormRef.current?.getFormData()
    
    console.log('📦 Checkout Form Data:', formData)
    console.log('📱 Phone value:', phoneNumber)
    
    // Use directOrder if available, otherwise use cart
    const items = directOrder ? [{
      id: directOrder.product.id,
      name: directOrder.product.name,
      size: directOrder.size,
      colorName: directOrder.colorName,
      price: directOrder.price,
      qty: directOrder.quantity,
      image: directOrder.product.image
    }] : cart
    
    if (items.length === 0) return
    
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
    
    setPayGateLoading(true)
    setShowPhoneModal(false)
    
    try {
      // Create order
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.id,
            productName: item.name,
            productImage: item.image || null,
            colorName: item.colorName,
            size: item.size,
            quantity: item.qty,
            unitPrice: item.price
          })),
          customerInfo: {
            email: formData?.email || user?.email,
            phone: phoneNumber,
            firstName: formData?.firstName || user?.firstName,
            lastName: formData?.lastName || user?.lastName
          },
          shippingAddress: {
            city: formData?.city,
            address: formData?.address,
            country: 'Togo',
            phone: phoneNumber,
            latitude: formData?.latitude,
            longitude: formData?.longitude
          },
          subtotal,
          shippingCost: 0,
          total: subtotal,
          paymentMethod: network === 'FLOOZ' ? 'moov_money' : 't_money'
        })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        // Initialize PayGate payment
        const paymentRes = await fetch('/api/paygate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            orderId: data.order.id,
            phoneNumber: phoneNumber,
            network: network
          })
        })
        const paymentData = await paymentRes.json()
        
        if (paymentData.demo) {
          // Demo mode
          showToast('Succès', 'Commande créée ! (Mode démo - PayGate non configuré)')
          setCart([])
          setDirectOrder(null)
          setShowCheckoutModal(false)
          if (user) fetchUserOrders()
        } else if (paymentData.success) {
          // Real PayGate - payment initiated
          showToast('Paiement initié', 'Vous allez recevoir une demande de confirmation sur votre téléphone.')
          setCart([])
          setDirectOrder(null)
          setShowCheckoutModal(false)
          if (user) fetchUserOrders()
        } else {
          showToast('Erreur', paymentData.error || 'Erreur lors du paiement', 'error')
        }
      } else {
        showToast('Erreur', data.error || 'Erreur lors de la création de la commande', 'error')
      }
    } catch {
      showToast('Erreur', 'Erreur lors de la commande', 'error')
    } finally {
      setPayGateLoading(false)
    }
  }

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const [productsRes, menuRes, slidesRes, logoRes, maisonImageRes, contentRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/menu'),
          fetch('/api/slides'),
          fetch('/api/settings/logo'),
          fetch('/api/settings/maison-image'),
          fetch('/api/content')
        ])
        
        if (productsRes.ok) setProducts(await productsRes.json())
        if (menuRes.ok) {
          const data = await menuRes.json()
          setMenuCategories(data)
          if (data.length > 0 && data[0].subCategories?.length > 0) {
            setActiveSubCategory(data[0].subCategories[0].id)
          }
        }
        if (slidesRes.ok) setHeroSlides(await slidesRes.json())
        if (logoRes.ok) {
          const data = await logoRes.json()
          setLogo(data?.value || '/logo.png')
        } else {
          setLogo('/logo.png')
        }
        if (maisonImageRes.ok) {
          const data = await maisonImageRes.json()
          if (data?.value) setMaisonImage(data.value)
        }
        if (contentRes.ok) setSiteContent(await contentRes.json())
      } catch (error) {
        console.error('Error fetching data:', error)
        setLogo('/logo.png')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  // Hero Slider auto-play
  useEffect(() => {
    // Pause slider when any modal is open
    const isModalOpen = showAuthModal || showProductModal || showCheckoutModal || showProductFormModal || showSubCatModal
    
    if (heroSlides.length > 1 && !isModalOpen) {
      const currentInterval = heroSlides[currentSlide]?.interval || 5000
      if (slideIntervalRef.current) clearInterval(slideIntervalRef.current)
      slideIntervalRef.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
      }, currentInterval)
    } else {
      // Clear interval when modal is open
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current)
        slideIntervalRef.current = null
      }
    }
    return () => {
      if (slideIntervalRef.current) clearInterval(slideIntervalRef.current)
  }
  }, [heroSlides, showAuthModal, showProductModal, showCheckoutModal, showProductFormModal, showSubCatModal])

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 100)
    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Animate elements
  useEffect(() => {
    const allElements = document.querySelectorAll('.animate-on-scroll')
    allElements.forEach((el) => el.classList.remove('visible'))
    const timer = setTimeout(() => {
      const currentSectionEl = document.getElementById(currentSection)
      if (currentSectionEl) {
        const elements = currentSectionEl.querySelectorAll('.animate-on-scroll')
        elements.forEach((el, index) => {
          setTimeout(() => el.classList.add('visible'), index * 50)
        })
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [currentSection])

  // Navigation
  const navigateTo = (section: string) => {
    setCurrentSection(section)
    setIsMenuOpen(false)
    setActiveMegaMenu(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Mega Menu handlers
  const handleMenuEnter = (slug: string) => {
    if (megaMenuTimeoutRef.current) clearTimeout(megaMenuTimeoutRef.current)
    setActiveMegaMenu(slug)
  }

  const handleMenuLeave = () => {
    megaMenuTimeoutRef.current = setTimeout(() => setActiveMegaMenu(null), 200)
  }

  // Cart functions
  const addToCart = (product: Product, size: string, color: string, colorName: string, price: number) => {
    if (product.totalStock <= 0) return
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.size === size && item.color === color)
      if (existing) {
        return prev.map(item => 
          item.id === product.id && item.size === size && item.color === color
            ? { ...item, qty: item.qty + 1 }
            : item
        )
      }
      return [...prev, { id: product.id, name: product.name, price, size, color, colorName, qty: 1, image: product.image }]
    })
    setShowProductModal(false)
    setSelectedSize(null)
  }

  const removeFromCart = (index: number) => setCart(prev => prev.filter((_, i) => i !== index))
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0)

  // Filter products
  const getFilteredProducts = (filter: string, genre: string = currentGenre) => {
    let filtered = products.filter(p => p.isActive && p.type === 'chaussure')
    if (filter !== 'all') {
      filtered = filtered.filter(p => {
        const matchingSub = menuCategories.find(cat => cat.slug === 'chaussures')?.subCategories.find(sub => sub.slug === filter)
        if (matchingSub) return p.subCategory === matchingSub.name || p.category === filter
        return p.category === filter
      })
    }
    if (genre !== 'all') {
      filtered = filtered.filter(p => p.genre === genre || p.genre === 'mixte')
    }
    return filtered
  }

  // WhatsApp link
  const getWhatsAppLink = (message: string) => `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`

  // Handle form submit
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      showToast("Erreur", "Veuillez remplir le nom du produit", "error")
      return
    }
    if (formType === 'chaussure' && formData.sizes.length === 0) {
      showToast("Erreur", "Veuillez sélectionner au moins une pointure", "error")
      return
    }
    if (formData.colors.length === 0) {
      showToast("Erreur", "Veuillez ajouter au moins une couleur avec des images", "error")
      return
    }
    for (const color of formData.colors) {
      if (!color.images || color.images.length === 0) {
        showToast("Erreur", `La couleur ${color.colorName} n'a pas d'images`, "error")
        return
      }
      if (!color.sizes || color.sizes.length === 0) {
        showToast("Erreur", `La couleur ${color.colorName} n'a pas de tailles définies`, "error")
        return
      }
      if (!color.sizes.some(s => s.stock > 0)) {
        showToast("Erreur", `La couleur ${color.colorName} n'a pas de stock`, "error")
        return
      }
    }
    
    const sizesToSave = formType === 'accessoire' && formData.sizes.length === 0 ? ['Unique'] : formData.sizes
    const colorsToSave = formData.colors.map(c => ({
      colorName: c.colorName,
      colorValue: c.colorValue,
      images: c.images || [],
      sizes: c.sizes?.map(s => ({ size: s.size, price: s.price, stock: s.stock })) || []
    }))
    
    const productData = {
      name: formData.name,
      category: formData.category,
      subCategory: formData.subCategory || null,
      genre: formData.genre,
      description: formData.description || null,
      image: formData.colors[0]?.images?.[0] || '',
      sizes: sizesToSave,
      type: formData.type,
      isBestSeller: formData.isBestSeller,
      isNew: formData.isNew,
      colors: colorsToSave
    }
    
    try {
      let res
      if (editingProduct) {
        res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProduct.id, ...productData })
        })
      } else {
        res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productData)
        })
      }
      if (res.ok) {
        const productsRes = await fetch('/api/products')
        if (productsRes.ok) setProducts(await productsRes.json())
        closeProductForm()
        showToast("Succès", editingProduct ? "Le produit a été modifié avec succès" : "Le produit a été ajouté avec succès")
      } else {
        const errorData = await res.json().catch(() => ({}))
        showToast("Erreur", errorData.error || "Impossible d'enregistrer le produit", "error")
      }
    } catch (error) {
      showToast("Erreur", "Une erreur est survenue", "error")
    }
  }

  // Open edit product
  const openEditProduct = (product: Product) => {
    setEditingProduct(product)
    setFormType(product.type as 'chaussure' | 'accessoire')
    setFormData({
      name: product.name,
      category: product.category,
      subCategory: product.subCategory || '',
      genre: (product.genre || 'femme') as 'homme' | 'femme' | 'mixte',
      description: product.description || '',
      sizes: product.sizes,
      type: product.type as 'chaussure' | 'accessoire',
      isBestSeller: product.isBestSeller || false,
      isNew: product.isNew ?? true,
      colors: product.colors || []
    })
    setShowProductFormModal(true)
  }

  // Close product form
  const closeProductForm = () => {
    setShowProductFormModal(false)
    setEditingProduct(null)
    setFormData({
      name: '',
      category: '',
      subCategory: '',
      genre: 'femme',
      description: '',
      sizes: [],
      type: 'chaussure',
      isBestSeller: false,
      isNew: true,
      colors: []
    })
    setNewColor(null)
    setEditingColorIndex(-1)
  }

  // Delete product
  const deleteProduct = async (id: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce produit ?')) return
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id))
        showToast("Succès", "Le produit a été supprimé avec succès")
      } else {
        showToast("Erreur", "Impossible de supprimer le produit", "error")
      }
    } catch (error) {
      showToast("Erreur", "Une erreur est survenue", "error")
    }
  }

  // Toggle size
  const toggleSize = (size: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.includes(size) ? prev.sizes.filter(s => s !== size) : [...prev.sizes, size]
    }))
  }

  // Auth Modal Content
  const authModalContent = useMemo(() => {
    if (!showAuthModal) return null
    
    const handleAuthSubmit = async (data: { email: string; password: string; firstName?: string; lastName?: string; phone?: string }) => {
      if (authMode === 'login') {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.email, password: data.password })
          })
          const resData = await res.json()
          if (res.ok) {
            localStorage.setItem('user', JSON.stringify(resData.user))
            setUser(resData.user)
            setShowAuthModal(false)
            showToast('Bienvenue', `Connexion réussie`)
          } else {
            showToast('Erreur', resData.error || 'Erreur de connexion', 'error')
          }
        } catch {
          showToast('Erreur', 'Erreur de connexion', 'error')
        }
      } else {
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          })
          const resData = await res.json()
          if (res.ok) {
            localStorage.setItem('user', JSON.stringify(resData.user))
            setUser(resData.user)
            setShowAuthModal(false)
            showToast('Bienvenue', 'Compte créé avec succès')
          } else {
            showToast('Erreur', resData.error || 'Erreur lors de l\'inscription', 'error')
          }
        } catch {
          showToast('Erreur', 'Erreur lors de l\'inscription', 'error')
        }
      }
    }
    
    const handleForgotPasswordClick = async (email: string) => {
      if (!email) {
        showToast('Erreur', 'Veuillez entrer votre email d\'abord', 'error')
        return
      }
      if (forgotPasswordLoading) return
      
      setForgotPasswordLoading(true)
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        })
        const data = await res.json()
        
        if (data.error) {
          showToast('Erreur', data.error, 'error')
        } else if (data.newPassword) {
          showToast('Mot de passe généré', `Nouveau mot de passe: ${data.newPassword}`, 'success')
        } else {
          showToast('Succès', data.message || 'Un nouveau mot de passe a été envoyé à votre email', 'success')
        }
      } catch (err) {
        console.error('Forgot password error:', err)
        showToast('Erreur', 'Erreur de connexion. Veuillez réessayer.', 'error')
      } finally {
        setForgotPasswordLoading(false)
      }
    }
    
    return (
      <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4" onClick={() => setShowAuthModal(false)}>
        <div className="bg-[#F8F6F3] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-display" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              {authMode === 'login' ? 'Connexion' : 'Créer un compte'}
            </h2>
            <button onClick={() => setShowAuthModal(false)} className="text-[#6B6560] hover:text-[#0A0A0A]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <AuthForm
            mode={authMode}
            onSubmit={handleAuthSubmit}
            onForgotPassword={handleForgotPasswordClick}
            onSwitchMode={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
            forgotPasswordLoading={forgotPasswordLoading}
          />
        </div>
      </div>
    )
  }, [showAuthModal, authMode, showPassword, forgotPasswordLoading, showToast, setUser, setShowAuthModal, setAuthMode, setShowPassword, setForgotPasswordLoading])

  // Checkout Modal
  const CheckoutModal = () => {
    if (!showCheckoutModal) return null
    
    // Use directOrder if available, otherwise use cart
    const orderItems = directOrder ? [{
      id: directOrder.product.id,
      name: directOrder.product.name,
      size: directOrder.size,
      colorName: directOrder.colorName,
      price: directOrder.price,
      qty: directOrder.quantity,
      image: directOrder.product.image
    }] : cart
    
    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0)
    
    const handleDirectCheckout = async () => {
      const formData = checkoutFormRef.current?.getFormData()
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: orderItems.map(item => ({
              productId: item.id,
              productName: item.name,
              productImage: item.image,
              colorName: item.colorName || null,
              size: item.size,
              quantity: item.qty,
              unitPrice: item.price
            })),
            customerInfo: {
              email: formData?.email || user?.email,
              phone: formData?.phone || user?.phone,
              firstName: formData?.firstName || user?.firstName,
              lastName: formData?.lastName || user?.lastName
            },
            shippingAddress: {
              city: formData?.city,
              address: formData?.address,
              country: 'Togo',
              phone: formData?.phone || user?.phone,
              latitude: formData?.latitude,
              longitude: formData?.longitude
            },
            subtotal,
            shippingCost: 0,
            total: subtotal,
            paymentMethod: 'direct'
          })
        })
        const data = await res.json()
        
        if (res.ok) {
          showToast('Succès', 'Commande enregistrée avec succès !')
          setShowCheckoutModal(false)
          setDirectOrder(null)
          setCart([])
          if (user) fetchUserOrders()
        } else {
          showToast('Erreur', data.error || 'Erreur lors de la commande', 'error')
        }
      } catch {
        showToast('Erreur', 'Erreur lors de la commande', 'error')
      }
    }
    
    return createPortal(
      <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4" onClick={() => setShowCheckoutModal(false)}>
        <div className="bg-[#F8F6F3] w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="p-6 border-b border-[#E5E0DA]">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-display" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Finaliser la commande</h2>
              <button onClick={() => setShowCheckoutModal(false)} className="text-[#6B6560] hover:text-[#0A0A0A]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {/* Steps */}
            <div className="flex mb-8">
              {['info', 'shipping', 'payment'].map((step, idx) => (
                <div key={step} className="flex-1 flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    checkoutStep === step ? 'bg-[#9C7C5C] text-white' :
                    idx < ['info', 'shipping', 'payment'].indexOf(checkoutStep) ? 'bg-[#8B6B4B] text-white' :
                    'bg-[#E5E0DA] text-[#6B6560]'
                  }`}>
                    {idx + 1}
                  </div>
                  {idx < 2 && <div className="flex-1 h-px bg-[#E5E0DA]" />}
                </div>
              ))}
            </div>

            <CheckoutForm
              ref={checkoutFormRef}
              checkoutStep={checkoutStep}
              setCheckoutStep={setCheckoutStep}
              onDirectCheckout={handleDirectCheckout}
              onPayGateCheckout={handlePayGateCheckout}
              payGateLoading={payGateLoading}
              formatPrice={formatPrice}
              orderItems={orderItems}
              subtotal={subtotal}
              user={user}
            />
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // Product card component
  const ProductCard = ({ product, index }: { product: Product; index: number }) => {
    const stockClass = product.totalStock === 0 ? 'text-red-600' : product.totalStock <= 5 ? 'text-orange-600' : 'text-[#15803D]'
    const stockLabel = product.totalStock === 0 ? 'Rupture de stock' : product.totalStock <= 5 ? `Stock limité (${product.totalStock})` : 'En stock'
    const genreLabel = product.genre === 'homme' ? 'Homme' : product.genre === 'femme' ? 'Femme' : 'Mixte'
    const firstColor = product.colors?.[0]?.colorValue || null
    
    return (
      <article 
        className="product-card aspect-[3/4] cursor-pointer"
        style={{ transitionDelay: `${(index % 4) * 0.1}s` }}
        onClick={() => {
          setCurrentProduct(product)
          setSelectedSize(product.sizes[0] || null)
          setSelectedColorValue(firstColor)
          setShowProductModal(true)
        }}
      >
        <img src={product.image} alt={product.name} onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x500?text=Image' }} />
        <div className="product-overlay"></div>
        <div className="product-info">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs tracking-widest uppercase opacity-70">{product.subCategory || ''}</p>
            <span className="text-xs opacity-70">{genreLabel}</span>
          </div>
          <h3 className="font-display text-xl mb-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{product.name}</h3>
          <div className="flex justify-between items-center">
            <p className="text-lg">
              {product.minPrice > 0 ? (<><span className="text-xs opacity-70">À partir de </span>{formatPrice(product.minPrice)}</>) : 'Prix sur demande'}
            </p>
            <p className={`text-xs ${stockClass} border border-current px-2 py-0.5 rounded-full`}>{stockLabel}</p>
          </div>
        </div>
      </article>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${headerScrolled ? 'bg-[#F8F6F3]/95 backdrop-blur-md border-b border-[#E5E0DA]' : 'bg-[#F8F6F3]/80 backdrop-blur-sm border-b border-[#E5E0DA]/50'}`}>
        <div className="flex items-center justify-between px-6 lg:px-12 py-6">
          <button className="flex items-center gap-3" onClick={() => navigateTo('home')}>
            <img src={logo || '/logo.png'} alt="MAISON KHAN Logo" className="h-12 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png' }} />
            <span className="font-display text-base sm:text-xl tracking-wider text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>MAISON KHAN</span>
          </button>
          
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8 relative">
            <button className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]" onClick={() => navigateTo('home')}>Accueil</button>
            {menuCategories.map((cat) => (
              <div key={cat.id} className="relative" onMouseEnter={() => handleMenuEnter(cat.slug)} onMouseLeave={handleMenuLeave}>
                <button className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]" onClick={() => { if (cat.slug === 'accessoires') navigateTo('accessoires'); else if (cat.slug === 'chaussures') navigateTo('catalogue') }}>
                  {cat.name}
                </button>
                {activeMegaMenu === cat.slug && cat.subCategories?.length > 0 && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 pt-4 w-[800px]" onMouseEnter={() => handleMenuEnter(cat.slug)} onMouseLeave={handleMenuLeave}>
                    <div className="bg-[#F8F6F3] border border-[#E5E0DA] shadow-lg p-6">
                      <div className="flex gap-4 mb-4 border-b border-[#E5E0DA] pb-3">
                        <button className={`text-xs font-medium tracking-widest uppercase px-4 py-2 transition-colors ${megaMenuGenre === 'femme' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'text-[#6B6560] hover:text-[#0A0A0A]'}`} onClick={() => setMegaMenuGenre('femme')}>Femme</button>
                        <button className={`text-xs font-medium tracking-widest uppercase px-4 py-2 transition-colors ${megaMenuGenre === 'homme' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'text-[#6B6560] hover:text-[#0A0A0A]'}`} onClick={() => setMegaMenuGenre('homme')}>Homme</button>
                        <button className={`text-xs font-medium tracking-widest uppercase px-4 py-2 transition-colors ${megaMenuGenre === 'mixte' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'text-[#6B6560] hover:text-[#0A0A0A]'}`} onClick={() => setMegaMenuGenre('mixte')}>Mixte</button>
                      </div>
                      <div className="flex gap-8">
                        <div className="flex-shrink-0 w-48">
                          <h4 className="text-xs uppercase tracking-widest text-[#6B6560] mb-4">Catégories</h4>
                          <div className="flex flex-col gap-1">
                            {cat.subCategories.filter(sub => sub.genre === megaMenuGenre || sub.genre === 'all' || (megaMenuGenre !== 'mixte' && sub.genre === 'mixte')).map((sub) => (
                              <button key={sub.id} className={`text-left py-2 px-4 transition-colors text-sm ${activeSubCategory === sub.id ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'hover:bg-[#EDE8E1] text-[#0A0A0A]'}`}
                                onClick={() => { setActiveSubCategory(sub.id); setCurrentGenre(megaMenuGenre); navigateTo(cat.slug === 'accessoires' ? 'accessoires' : 'catalogue') }}
                                onMouseEnter={() => setActiveSubCategory(sub.id)}>{sub.name}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex-1 flex gap-4">
                          {cat.subCategories.filter(sub => sub.genre === megaMenuGenre || sub.genre === 'all' || (megaMenuGenre !== 'mixte' && sub.genre === 'mixte')).find(sub => sub.id === activeSubCategory)?.images?.slice(0, 3).map((img) => (
                            <div key={img.id} className="relative flex-1 aspect-[3/4] overflow-hidden bg-[#EDE8E1]">
                              <img src={img.image} alt={img.title || ''} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/300x400?text=Image' }} />
                              {img.title && <div className="absolute bottom-0 left-0 right-0 bg-[#0A0A0A]/70 text-[#F8F6F3] p-2"><p className="text-xs">{img.title}</p></div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]" onClick={() => navigateTo('maison')}>Notre Maison</button>
            <button className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]" onClick={() => navigateTo('apropos')}>À propos</button>
            <button className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]" onClick={() => navigateTo('contact')}>Contact</button>
          </nav>
          
          {/* User Menu & Cart */}
          <div className="hidden lg:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigateTo('account')}
                  className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]"
                >
                  Mon Compte
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="nav-link text-xs font-medium tracking-widest uppercase text-[#0A0A0A]"
              >
                Connexion
              </button>
            )}
            
            {/* Cart Button */}
            <button
              onClick={() => setShowCartModal(true)}
              className="relative"
            >
              <svg className="w-5 h-5 text-[#0A0A0A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#9C7C5C] text-white text-xs rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
          
          {/* Mobile Menu Toggle */}
          <button className="lg:hidden relative w-8 h-6 flex flex-col justify-between z-[110]" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Menu">
            <span className={`w-full h-px bg-[#0A0A0A] transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2.5' : ''}`}></span>
            <span className={`w-full h-px bg-[#0A0A0A] transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
            <span className={`w-full h-px bg-[#0A0A0A] transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2.5' : ''}`}></span>
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      <div className={`fixed inset-0 bg-black/50 z-[100] lg:hidden transition-opacity duration-300 ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMenuOpen(false)} />
      <div className={`fixed top-0 right-0 h-full w-[280px] bg-[#F8F6F3] z-[101] lg:hidden transform transition-transform duration-300 ease-out ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-[#E5E0DA]">
            <span className="font-display text-lg tracking-wider text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Menu</span>
            <button onClick={() => setIsMenuOpen(false)} className="w-10 h-10 flex items-center justify-center text-[#0A0A0A] hover:bg-[#EDE8E1] rounded-full transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); navigateTo('home') }}>
              <span>Accueil</span>
              <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
            </button>
            {menuCategories.map((cat) => (
              <div key={cat.id} className="border-b border-[#E5E0DA]/50">
                <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between"
                  onClick={() => { if (cat.subCategories && cat.subCategories.length > 0) setExpandedMobileCategory(expandedMobileCategory === cat.id ? null : cat.id); else { setIsMenuOpen(false); navigateTo(cat.slug === 'accessoires' ? 'accessoires' : 'catalogue') } }}>
                  <span>{cat.name}</span>
                  {cat.subCategories && cat.subCategories.length > 0 ? (
                    <svg className={`w-5 h-5 text-[#6B6560] transition-transform duration-200 ${expandedMobileCategory === cat.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" /></svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
                  )}
                </button>
                {cat.subCategories && cat.subCategories.length > 0 && expandedMobileCategory === cat.id && (
                  <div className="bg-[#EDE8E1]/50 py-2">
                    <div className="flex gap-2 px-6 mb-2">
                      <button className={`flex-1 text-xs font-medium tracking-widest uppercase py-2 px-2 transition-colors ${mobileMenuGenre === 'femme' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'text-[#6B6560] hover:text-[#0A0A0A] border border-[#E5E0DA]'}`} onClick={() => setMobileMenuGenre('femme')}>Femme</button>
                      <button className={`flex-1 text-xs font-medium tracking-widest uppercase py-2 px-2 transition-colors ${mobileMenuGenre === 'homme' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'text-[#6B6560] hover:text-[#0A0A0A] border border-[#E5E0DA]'}`} onClick={() => setMobileMenuGenre('homme')}>Homme</button>
                      <button className={`flex-1 text-xs font-medium tracking-widest uppercase py-2 px-2 transition-colors ${mobileMenuGenre === 'mixte' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'text-[#6B6560] hover:text-[#0A0A0A] border border-[#E5E0DA]'}`} onClick={() => setMobileMenuGenre('mixte')}>Mixte</button>
                    </div>
                    <button className="w-full text-left px-10 py-3 text-[#6B6560] text-sm hover:bg-[#EDE8E1] transition-colors" onClick={() => { setIsMenuOpen(false); setCurrentGenre(mobileMenuGenre); navigateTo(cat.slug === 'accessoires' ? 'accessoires' : 'catalogue') }}>Voir tout</button>
                    {cat.subCategories.filter(sub => sub.genre === mobileMenuGenre || sub.genre === 'all' || (mobileMenuGenre !== 'mixte' && sub.genre === 'mixte')).map((sub) => (
                      <button key={sub.id} className="w-full text-left px-10 py-3 text-[#6B6560] text-sm hover:bg-[#EDE8E1] transition-colors" onClick={() => { setIsMenuOpen(false); setActiveSubCategory(sub.id); setCurrentGenre(mobileMenuGenre); navigateTo(cat.slug === 'accessoires' ? 'accessoires' : 'catalogue') }}>{sub.name}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); navigateTo('maison') }}>
              <span>Notre Maison</span>
              <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
            </button>
            <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); navigateTo('apropos') }}>
              <span>À propos</span>
              <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
            </button>
            <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); navigateTo('contact') }}>
              <span>Contact</span>
              <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
            </button>
            
            {/* Mobile User Menu */}
            <div className="border-t border-[#E5E0DA]">
              {user ? (
                <>
                  <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); navigateTo('account') }}>
                    <span>Mon Compte</span>
                    <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button className="w-full text-left px-6 py-4 text-[#6B6560] font-medium text-base hover:bg-[#EDE8E1] transition-colors" onClick={() => { setIsMenuOpen(false); handleLogout(); }}>
                    <span>Déconnexion</span>
                  </button>
                </>
              ) : (
                <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); setShowAuthModal(true); }}>
                  <span>Connexion</span>
                  <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
              
              {/* Mobile Cart Button */}
              <button className="w-full text-left px-6 py-4 text-[#0A0A0A] font-medium text-base hover:bg-[#EDE8E1] transition-colors flex items-center justify-between" onClick={() => { setIsMenuOpen(false); setShowCartModal(true); }}>
                <span>Panier {cartCount > 0 && `(${cartCount})`}</span>
                <svg className="w-5 h-5 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              </button>
            </div>
          </div>
          <div className="p-4 border-t border-[#E5E0DA]">
            <a href={getWhatsAppLink("Bonjour MAISON KHAN, je souhaite en savoir plus sur vos créations.")} target="_blank" rel="noopener" className="w-full flex items-center justify-center gap-2 bg-[#9C7C5C] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#8B6B4B] transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              <span>Nous contacter</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        {/* HOME SECTION */}
        <section className={`page-section ${currentSection === 'home' ? 'active' : ''}`} id="home">
          {/* Hero with Slider */}
          <div className="relative min-h-screen flex items-center grain" style={{ background: 'linear-gradient(180deg, #F8F6F3 0%, #EDE8E1 100%)' }}>
            {heroSlides.length > 0 && (
              <div className="absolute inset-0 overflow-hidden">
                {heroSlides.map((slide, index) => (
                  <div key={slide.id} className={`absolute inset-0 transition-opacity duration-1000 ${currentSlide === index ? 'opacity-100' : 'opacity-0'}`}>
                    {slide.type === 'video' ? (
                      <div className="relative w-full h-full">
                        <video src={slide.image} className="w-full h-full object-cover" autoPlay muted={videoMuted} loop playsInline preload="metadata" id={`hero-video-${slide.id}`} onError={(e) => { const container = (e.target as HTMLVideoElement).parentElement; if (container) container.innerHTML = '<div class="w-full h-full bg-gray-800 flex items-center justify-center"><div class="text-center text-white p-8"><p class="text-lg font-medium">Vidéo non disponible</p></div></div>' }} onCanPlay={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}) }} />
                      </div>
                    ) : (
                      <img src={slide.image} alt={slide.title || ''} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/1920x1080?text=Slide' }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#F8F6F3]/30 to-[#F8F6F3]"></div>
                  </div>
                ))}
              </div>
            )}
            
            {heroSlides.length > 1 && (
              <>
                <button className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-colors z-10" onClick={() => setCurrentSlide(prev => prev === 0 ? heroSlides.length - 1 : prev - 1)}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-colors z-10" onClick={() => setCurrentSlide(prev => (prev + 1) % heroSlides.length)}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                  {heroSlides.map((slide, index) => (
                    <button key={index} className={`w-3 h-3 rounded-full transition-all ${currentSlide === index ? 'bg-white scale-125' : 'bg-white/50'}`} onClick={() => setCurrentSlide(index)} />
                  ))}
                </div>
              </>
            )}
            
            <div className="relative container mx-auto px-6 lg:px-12 pt-32 pb-20 z-10">
              {getContent('hero_title', '') || getContent('hero_title_highlight', '') || getContent('hero_description', '') ? (
                <div className="max-w-5xl">
                  <h1 className="hero-title font-display text-[#0A0A0A] mb-8 animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    {getContent('hero_title', '') && <>{getContent('hero_title', '').split(' ').slice(0, 3).join(' ')}<br/></>}
                    <span className="font-light">{getContent('hero_title_highlight', '')}</span>
                  </h1>
                  {getContent('hero_description', '') && (
                    <p className="text-lg lg:text-xl text-[#6B6560] max-w-xl mb-12 font-light leading-relaxed animate-on-scroll">{getContent('hero_description', '')}</p>
                  )}
                  <div className="flex flex-wrap gap-4 animate-on-scroll">
                    {getContent('hero_button_primary', '') && (
                      <button className="btn-primary" style={{ width: 'auto' }} onClick={() => navigateTo('catalogue')}>
                        <span>{getContent('hero_button_primary', '')}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                      </button>
                    )}
                    {getContent('hero_button_secondary', '') && (
                      <button className="btn-outline-dark" style={{ width: 'auto' }} onClick={() => navigateTo('apropos')}><span>{getContent('hero_button_secondary', '')}</span></button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          
          {/* Nouveautés Section */}
          <div className="py-16 lg:py-24 bg-white">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="text-center mb-12">
                <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">{getContent('new_subtitle', 'Nouveautés')}</p>
                <h2 className="font-display text-4xl lg:text-5xl text-[#0A0A0A] animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{getContent('new_title', 'Dernières Créations')}</h2>
                <p className="text-[#6B6560] mt-4 max-w-2xl mx-auto animate-on-scroll">{getContent('new_description', 'Découvrez nos dernières pièces artisanales, fraîchement confectionnées par nos artisans.')}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {(() => {
                  const newProducts = products.filter(p => p.isActive && p.isNew)
                  const displayProducts = newProducts.length > 0 ? newProducts : products.filter(p => p.isActive)
                  return displayProducts.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)
                })()}
              </div>
              {products.filter(p => p.isActive).length === 0 && <p className="text-center py-12 text-[#6B6560]">Aucun produit disponible pour le moment.</p>}
              {products.filter(p => p.isActive).length > 0 && (
                <div className="text-center mt-12">
                  <button onClick={() => navigateTo('catalogue')} className="btn-outline-dark" style={{ width: 'auto' }}>
                    <span>Voir tout le catalogue</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Best-Sellers Section */}
          <div className="py-16 lg:py-24 bg-white">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="text-center mb-12">
                <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">Incontournables</p>
                <h2 className="font-display text-4xl lg:text-5xl text-[#0A0A0A] animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Best-Sellers</h2>
                <p className="text-[#6B6560] mt-4 max-w-2xl mx-auto animate-on-scroll">Les créations préférées de nos clients, symboles de notre excellence.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {(() => {
                  const bestSellers = products.filter(p => p.isActive && p.isBestSeller)
                  if (bestSellers.length === 0) {
                    return <div className="col-span-full text-center py-8 text-[#6B6560]"><p>Aucun produit marqué comme Best-Seller.</p><p className="text-sm mt-2">Cochez l&apos;option ⭐ Best-Seller dans le formulaire produit pour les afficher ici.</p></div>
                  }
                  return bestSellers.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)
                })()}
              </div>
            </div>
          </div>
          
          {/* Notre Savoir-Faire Section */}
          <div className="py-16 lg:py-24 bg-[#F8F6F3]">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="text-center mb-12">
                <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">Artisanat</p>
                <h2 className="font-display text-4xl lg:text-5xl text-[#0A0A0A] animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Notre Savoir-Faire</h2>
                <p className="text-[#6B6560] mt-4 max-w-2xl mx-auto animate-on-scroll">Chaque paire est le fruit d&apos;un savoir-faire ancestral, transmis de génération en génération.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {/* Step 1 */}
                <div className="text-center animate-on-scroll">
                  <div className="w-20 h-20 mx-auto mb-6 bg-[#9C7C5C]/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  </div>
                  <h3 className="font-display text-xl text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Cuir Sélectionné</h3>
                  <p className="text-sm text-[#6B6560]">Peaux premium choisies avec soin pour leur qualité exceptionnelle</p>
                </div>
                {/* Step 2 */}
                <div className="text-center animate-on-scroll">
                  <div className="w-20 h-20 mx-auto mb-6 bg-[#9C7C5C]/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"/>
                    </svg>
                  </div>
                  <h3 className="font-display text-xl text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Coupe Artisanale</h3>
                  <p className="text-sm text-[#6B6560]">Découpe précise à la main selon des techniques traditionnelles</p>
                </div>
                {/* Step 3 */}
                <div className="text-center animate-on-scroll">
                  <div className="w-20 h-20 mx-auto mb-6 bg-[#9C7C5C]/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
                    </svg>
                  </div>
                  <h3 className="font-display text-xl text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Couture Main</h3>
                  <p className="text-sm text-[#6B6560]">Assemblage méticuleux par nos artisans expérimentés</p>
                </div>
                {/* Step 4 */}
                <div className="text-center animate-on-scroll">
                  <div className="w-20 h-20 mx-auto mb-6 bg-[#9C7C5C]/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                    </svg>
                  </div>
                  <h3 className="font-display text-xl text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Finition Luxe</h3>
                  <p className="text-sm text-[#6B6560]">Contrôle qualité rigoureux pour une excellence garantie</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Brand Statement */}
          <div className="relative py-32 lg:py-48 bg-[#0A0A0A] text-[#F8F6F3] grain overflow-hidden">
            <div className="relative container mx-auto px-6 lg:px-12 text-center">
              <div className="section-divider mx-auto mb-12 animate-on-scroll"></div>
              <blockquote className="font-display text-3xl lg:text-5xl font-light leading-tight max-w-4xl mx-auto mb-12 animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>&ldquo;L&apos;excellence artisanale Africaine sur chaque pas que vous faites.&rdquo;</blockquote>
              <p className="text-sm tracking-widest uppercase text-[#6B6560] animate-on-scroll">MAISON KHAN</p>
            </div>
          </div>
        </section>

        {/* CATALOGUE SECTION */}
        <section className={`page-section ${currentSection === 'accessoires' ? 'active' : ''}`} id="accessoires">
          <div className="min-h-screen pt-32 pb-24 bg-[#F8F6F3]">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-12">
                <div>
                  <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">{getContent('accessoires_subtitle', 'Catalogue')}</p>
                  <h1 className="font-display text-5xl lg:text-7xl text-[#0A0A0A] animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{getContent('accessoires_title', 'Nos Accessoires')}</h1>
                </div>
              </div>
              <div className="mb-8 animate-on-scroll">
                <div className="flex flex-wrap gap-3">
                  {menuCategories.find(cat => cat.slug === 'accessoires')?.subCategories.map((sub) => (
                    <button key={sub.id} className={`px-5 py-2 text-sm font-medium tracking-widest uppercase transition-all ${currentFilter === sub.slug ? 'bg-[#9C7C5C] text-white' : 'bg-transparent text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#9C7C5C] hover:text-[#9C7C5C]'}`} onClick={() => setCurrentFilter(sub.slug)}>{sub.name}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-8">
                {products.filter(p => p.isActive && p.type === 'accessoire').map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
                {products.filter(p => p.isActive && p.type === 'accessoire').length === 0 && <p className="col-span-full text-center py-12 text-[#6B6560]">Aucun accessoire disponible.</p>}
              </div>
            </div>
          </div>
        </section>

        {/* CATALOGUE SECTION */}
        <section className={`page-section ${currentSection === 'catalogue' ? 'active' : ''}`} id="catalogue">
          <div className="min-h-screen pt-32 pb-24 bg-[#F8F6F3]">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-8">
                <div>
                  <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">{getContent('catalogue_subtitle', 'Catalogue')}</p>
                  <h1 className="font-display text-5xl lg:text-7xl text-[#0A0A0A] animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{getContent('catalogue_title', 'Nos Chaussures')}</h1>
                </div>
              </div>
              <div className="mb-8 animate-on-scroll space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-3">Genre</p>
                  <div className="flex flex-wrap gap-3">
                    <button className={`px-5 py-2 text-sm font-medium tracking-widest uppercase transition-all ${currentGenre === 'all' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'bg-transparent text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#0A0A0A]'}`} onClick={() => setCurrentGenre('all')}>Tous les genres</button>
                    <button className={`px-5 py-2 text-sm font-medium tracking-widest uppercase transition-all ${currentGenre === 'femme' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'bg-transparent text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#0A0A0A]'}`} onClick={() => setCurrentGenre('femme')}>Femme</button>
                    <button className={`px-5 py-2 text-sm font-medium tracking-widest uppercase transition-all ${currentGenre === 'homme' ? 'bg-[#0A0A0A] text-[#F8F6F3]' : 'bg-transparent text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#0A0A0A]'}`} onClick={() => setCurrentGenre('homme')}>Homme</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-3">Type de chaussure</p>
                  <div className="flex flex-wrap gap-3">
                    <button className={`px-5 py-2 text-sm font-medium tracking-widest uppercase transition-all ${currentFilter === 'all' ? 'bg-[#9C7C5C] text-white' : 'bg-transparent text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#9C7C5C] hover:text-[#9C7C5C]'}`} onClick={() => setCurrentFilter('all')}>Toutes</button>
                    {menuCategories.find(cat => cat.slug === 'chaussures')?.subCategories.filter(sub => currentGenre === 'all' || sub.genre === currentGenre || sub.genre === 'all').map((sub) => (
                      <button key={sub.id} className={`px-5 py-2 text-sm font-medium tracking-widest uppercase transition-all ${currentFilter === sub.slug ? 'bg-[#9C7C5C] text-white' : 'bg-transparent text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#9C7C5C] hover:text-[#9C7C5C]'}`} onClick={() => setCurrentFilter(sub.slug)}>{sub.name}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-8">
                {getFilteredProducts(currentFilter).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
                {getFilteredProducts(currentFilter).length === 0 && <p className="col-span-full text-center py-12 text-[#6B6560]">Aucune chaussure disponible dans cette catégorie.</p>}
              </div>
            </div>
          </div>
        </section>

        {/* MAISON SECTION */}
        <section className={`page-section ${currentSection === 'maison' ? 'active' : ''}`} id="maison">
          <div className="bg-[#F8F6F3]">
            <div className="relative min-h-[60vh] flex items-center justify-center grain">
              <div className="absolute inset-0 bg-gradient-to-b from-[#EDE8E1] to-[#F8F6F3]"></div>
              <div className="relative text-center px-6 pt-24">
                <p className="hero-subtitle text-[#9C7C5C] mb-6 animate-on-scroll">Made in Africa</p>
                <h1 className="font-display text-5xl lg:text-7xl text-[#0A0A0A] animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Notre Maison</h1>
              </div>
            </div>
            <div className="py-24 lg:py-32">
              <div className="container mx-auto px-6 lg:px-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                  <div className="order-2 lg:order-1">
                    <div className="section-divider mb-8 animate-on-scroll"></div>
                    <h2 className="font-display text-3xl lg:text-4xl text-[#0A0A0A] mb-8 animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>L&apos;Âme d&apos;un Artisanat</h2>
                    <div className="space-y-6 text-[#6B6560] leading-relaxed text-base lg:text-lg">
                      <p className="animate-on-scroll">MAISON KHAN n&apos;est pas simplement une marque, c&apos;est l&apos;écho d&apos;une passion transmise de génération en génération. Au cœur de Lomé, sous le soleil togolais, nos artisans insufflent une âme à chaque morceau de cuir.</p>
                      <p className="animate-on-scroll">Nous croyons que le luxe véritable a une odeur de sueur et de fierté, celle de mains expertes qui tressent, cousent et polissent pendant des heures.</p>
                    </div>
                  </div>
                  <div className="order-1 lg:order-2 animate-on-scroll">
                    <div className="w-full overflow-hidden">
                      <img src={maisonImage || "https://placehold.co/800x600?text=Atelier"} alt="Artisan MAISON KHAN à Lomé" className="w-full h-auto object-cover" loading="lazy" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* A PROPOS SECTION */}
        <section className={`page-section ${currentSection === 'apropos' ? 'active' : ''}`} id="apropos">
          <div className="min-h-screen pt-32 pb-24 bg-[#F8F6F3]">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="max-w-3xl mb-16">
                <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">Notre Histoire</p>
                <h1 className="font-display text-5xl lg:text-7xl text-[#0A0A0A] mb-8 animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>À Propos</h1>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="aspect-square bg-[#EDE8E1] animate-on-scroll relative group overflow-hidden rounded-sm">
                  <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d126928.36354833658!2d1.14789465!3d6.1724969!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1023e1c113185419%3A0x3224b5422caf411d!2sLom%C3%A9%2C%20Togo!5e0!3m2!1sfr!2sfr!4v1709141760000!5m2!1sfr!2sfr" width="100%" height="100%" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0"></iframe>
                  <a href="https://maps.app.goo.gl/vkTQ3DPjAZuJDihs6" target="_blank" rel="noopener" className="absolute inset-0 z-10" title="Ouvrir dans Google Maps"></a>
                </div>
                <div className="animate-on-scroll space-y-8">
                  <div>
                    <h3 className="font-display text-2xl text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Notre Engagement</h3>
                    <p className="text-[#6B6560] leading-relaxed mb-4">Depuis nos ateliers à Lomé, nous nous engageons à promouvoir l&apos;excellence du cuir africain. Chaque pièce raconte une histoire, celle de l&apos;artisan qui l&apos;a façonnée.</p>
                    <p className="text-[#6B6560] leading-relaxed">Nous invitons nos clients et partenaires à découvrir notre univers, à toucher la matière et à rencontrer les hommes et femmes qui donnent vie à MAISON KHAN.</p>
                  </div>
                  <div className="pt-8 border-t border-[#6B6560]/10">
                    <h3 className="font-display text-xl text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Contact Direct</h3>
                    <p className="text-[#6B6560] mb-4">WhatsApp : +228 70 16 67 67</p>
                    <a href={getWhatsAppLink('Bonjour, je souhaite en savoir plus sur MAISON KHAN.')} target="_blank" rel="noopener" className="btn-whatsapp inline-flex" style={{ width: 'auto' }}><span>Discuter avec nous</span></a>
                  </div>
                </div>
              </div>
              
              {/* INTERNATIONAL ORDERS SECTION */}
              <div className="mt-20 pt-16 border-t border-[#6B6560]/10">
                <div className="text-center mb-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-[#9C7C5C] rounded-full mb-6">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="font-display text-3xl lg:text-4xl text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    COMMANDES INTERNATIONALES
                  </h2>
                  <p className="text-[#9C7C5C] text-sm font-bold uppercase tracking-widest">
                    À lire attentivement avant de commander
                  </p>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-10">
                  
                  {/* Card 1 */}
                  <div className="bg-white border border-[#E5E0DA] p-6 hover:border-[#9C7C5C] transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-[#9C7C5C]/10 rounded flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Expéditions Internationales</h3>
                        <p className="text-[#6B6560] text-sm leading-relaxed">
                          Droits de douane et taxes d'importation selon votre pays. <strong className="text-[#9C7C5C]">À la charge du client</strong>.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="bg-white border border-[#E5E0DA] p-6 hover:border-[#9C7C5C] transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-[#9C7C5C]/10 rounded flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Frais de Douane</h3>
                        <p className="text-[#6B6560] text-sm leading-relaxed">
                          Frais d'envoi au transporteur. Taxes et douanes à votre gouvernement.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card 3 - Retours */}
                  <div className="bg-white border border-red-300 p-6 hover:border-red-500 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-red-50 rounded flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Retours & Remboursements</h3>
                        <ul className="text-[#6B6560] text-sm space-y-1">
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            <span>Frais d'expédition non remboursables</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            <span>Aucun retour international accepté</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Card 4 */}
                  <div className="bg-white border border-[#E5E0DA] p-6 hover:border-[#9C7C5C] transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-[#9C7C5C]/10 rounded flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Avant de Commander</h3>
                        <p className="text-[#6B6560] text-sm leading-relaxed">
                          Vérifiez les <strong className="text-[#9C7C5C]">tailles</strong>, <strong className="text-[#9C7C5C]">descriptions</strong> et <strong className="text-[#9C7C5C]">photos</strong> avant commande.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Warning Box */}
                <div className="max-w-2xl mx-auto bg-[#9C7C5C]/10 border-2 border-[#9C7C5C] p-5 mb-8">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-[#9C7C5C] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-[#0A0A0A] text-sm">
                      <strong className="text-[#9C7C5C]">IMPORTANT :</strong> Frais de traitement appliqués aux commandes refusées. Aucune étiquette de retour fournie.
                    </p>
                  </div>
                </div>

                {/* Contact Button */}
                <div className="text-center">
                  <a 
                    href={getWhatsAppLink("Bonjour MAISON KHAN, j'ai une question concernant les commandes internationales.")}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-2 bg-[#9C7C5C] text-white px-6 py-3 text-sm uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors rounded"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    <span>Besoin d'aide ? Contactez-nous</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT SECTION */}
        <section className={`page-section ${currentSection === 'contact' ? 'active' : ''}`} id="contact">
          <div className="min-h-screen pt-32 pb-24 bg-[#F8F6F3]">
            <div className="container mx-auto px-6 lg:px-12">
              <div className="max-w-2xl mx-auto text-center">
                <p className="hero-subtitle text-[#9C7C5C] mb-4 animate-on-scroll">{getContent('contact_subtitle', 'Contact')}</p>
                <h1 className="font-display text-5xl lg:text-7xl text-[#0A0A0A] mb-6 animate-on-scroll" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{getContent('contact_title', 'Parlons-en')}</h1>
                <p className="text-[#6B6560] mb-12 animate-on-scroll">{getContent('contact_description', 'Une question, une commande ? Contactez-nous directement.')}</p>
                <div className="mb-12 animate-on-scroll space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    <a href={`mailto:${getContent('contact_email', 'contact@maison-khan.com')}`} className="text-[#0A0A0A] hover:text-[#9C7C5C] transition-colors">{getContent('contact_email', 'contact@maison-khan.com')}</a>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    <a href={`tel:${getContent('contact_phone', '00228 70 16 67 67').replace(/\s/g, '')}`} className="text-[#0A0A0A] hover:text-[#9C7C5C] transition-colors">{getContent('contact_phone', '00228 70 16 67 67')}</a>
                  </div>
                </div>
                <div className="mb-12 animate-on-scroll">
                  <a href={getWhatsAppLink('Bonjour MAISON KHAN, je souhaite vous contacter.')} target="_blank" rel="noopener" className="btn-whatsapp inline-flex" style={{ width: 'auto' }}><span>Discuter sur WhatsApp</span></a>
                </div>
                <div className="animate-on-scroll">
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-6">Suivez-nous</p>
                  <div className="social-links justify-center">
                    <a href="https://www.tiktok.com/@maison..khan7" target="_blank" className="social-icon" aria-label="TikTok">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                    </a>
                    <a href="https://www.instagram.com/maisonkhan7/?hl=fr" target="_blank" className="social-icon" aria-label="Instagram">
                      <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    </a>
                    <a href="https://web.facebook.com/p/Maison-KHAN-61558748014717/?_rdc=1&_rdr" target="_blank" className="social-icon" aria-label="Facebook">
                      <svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* USER DASHBOARD SECTION */}
        <section className={`page-section ${currentSection === 'account' ? 'active' : ''}`} id="account">
          <div className="min-h-screen pt-32 pb-24 bg-[#F8F6F3]">
            <div className="max-w-6xl mx-auto px-6">
              {!user ? (
                <div className="text-center py-16">
                  <h2 className="text-3xl font-display mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Mon Compte</h2>
                  <p className="text-[#6B6560] mb-8">Connectez-vous pour accéder à votre espace personnel</p>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="bg-[#9C7C5C] text-white px-8 py-3 uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
                  >
                    Se connecter
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h2 className="text-3xl font-display" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                        Bonjour, {user.firstName || user.email}
                      </h2>
                      <p className="text-[#6B6560]">{user.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="text-[#6B6560] hover:text-[#0A0A0A] text-sm uppercase tracking-wider"
                    >
                      Déconnexion
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex flex-wrap gap-2 border-b border-[#E5E0DA] mb-8">
                    {[
                      { id: 'orders', label: 'Mes Commandes' },
                      { id: 'profile', label: 'Mon Profil' },
                      { id: 'addresses', label: 'Mes Adresses' },
                      { id: 'admin-products', label: 'Produits', roles: ['admin'], action: () => { setAdminTab('products'); navigateTo('admin'); } },
                      { id: 'admin-orders', label: 'Commandes', roles: ['admin', 'manager'], action: () => { setAdminTab('orders'); navigateTo('admin'); fetchAdminOrders(); } },
                      { id: 'admin-users', label: 'Utilisateurs', roles: ['admin'], action: () => { setAdminTab('users'); navigateTo('admin'); fetchAdminUsers(); } }
                    ].filter(tab => !tab.roles || tab.roles.includes(user?.role || '')).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (tab.action) {
                            tab.action()
                          } else {
                            setDashboardTab(tab.id)
                          }
                        }}
                        className={`py-3 px-4 text-sm uppercase tracking-wider transition-colors ${
                          dashboardTab === tab.id
                            ? 'border-b-2 border-[#9C7C5C] text-[#9C7C5C]'
                            : 'text-[#6B6560] hover:text-[#0A0A0A]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Orders Tab */}
                  {dashboardTab === 'orders' && (
                    <div className="space-y-4">
                      {userOrders.length === 0 ? (
                        <div className="text-center py-12 bg-[#EDE8E1]">
                          <p className="text-[#6B6560]">Aucune commande pour le moment</p>
                          <button
                            onClick={() => navigateTo('catalogue')}
                            className="mt-4 bg-[#0A0A0A] text-white px-6 py-2 uppercase text-sm tracking-wider"
                          >
                            Découvrir nos créations
                          </button>
                        </div>
                      ) : (
                        userOrders.map(order => (
                          <div key={order.id} className="bg-white border border-[#E5E0DA] p-6">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <p className="font-medium">{order.orderNumber}</p>
                                <p className="text-sm text-[#6B6560]">
                                  {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className={`inline-block px-3 py-1 text-xs uppercase tracking-wider ${
                                  order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  order.status === 'paid' || order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                  order.status === 'shipped' ? 'bg-purple-100 text-purple-800' :
                                  order.status === 'delivered' ? 'bg-[#15803D]/10 text-[#15803D]' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {order.status === 'pending' ? 'En attente' :
                                   order.status === 'paid' ? 'Payée' :
                                   order.status === 'processing' ? 'En préparation' :
                                   order.status === 'shipped' ? 'Expédiée' :
                                   order.status === 'delivered' ? 'Livrée' : order.status}
                                </span>
                              </div>
                            </div>
                            <div className="border-t border-[#E5E0DA] pt-4">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between py-2">
                                  <span>{item.productName} - {item.size}{item.colorName ? `, ${item.colorName}` : ''} x{item.quantity}</span>
                                  <span>{formatPrice(item.totalPrice)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[#E5E0DA] pt-4 mt-4 flex justify-between font-medium">
                              <span>Total</span>
                              <span>{formatPrice(order.total)}</span>
                            </div>
                            {order.trackingNumber && (
                              <div className="mt-4 p-3 bg-[#EDE8E1] text-sm">
                                <p><strong>Suivi:</strong> {order.trackingNumber}</p>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Profile Tab */}
                  {dashboardTab === 'profile' && (
                    <div className="space-y-6">
                      {/* Informations personnelles */}
                      <div className="bg-white border border-[#E5E0DA] p-6">
                        <h3 className="text-lg font-medium mb-4">Informations personnelles</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Email</label>
                            <input type="email" defaultValue={user.email} disabled className="w-full p-3 bg-[#EDE8E1] border border-[#E5E0DA]" />
                          </div>
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Téléphone</label>
                            <input type="tel" defaultValue={user.phone || ''} className="w-full p-3 border border-[#E5E0DA]" />
                          </div>
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Prénom</label>
                            <input type="text" defaultValue={user.firstName || ''} className="w-full p-3 border border-[#E5E0DA]" />
                          </div>
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Nom</label>
                            <input type="text" defaultValue={user.lastName || ''} className="w-full p-3 border border-[#E5E0DA]" />
                          </div>
                        </div>
                        <button className="mt-6 bg-[#9C7C5C] text-white px-6 py-2 uppercase text-sm tracking-wider hover:bg-[#8B6B4B] transition-colors">
                          Enregistrer
                        </button>
                      </div>

                      {/* Changement de mot de passe */}
                      <div className="bg-white border border-[#E5E0DA] p-6">
                        <h3 className="text-lg font-medium mb-4">Changer le mot de passe</h3>
                        <div className="space-y-4 max-w-md">
                          {/* Mot de passe actuel */}
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Mot de passe actuel</label>
                            <div className="relative">
                              <input 
                                type={showCurrentPassword ? "text" : "password"}
                                name="currentPassword"
                                autoComplete="current-password"
                                value={passwordForm.currentPassword}
                                onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                                className="w-full p-3 pr-12 border border-[#E5E0DA] bg-white"
                                placeholder="Entrez votre mot de passe actuel"
                              />
                              <button 
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)} 
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6560] hover:text-[#0A0A0A] transition-colors"
                              >
                                {showCurrentPassword ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Nouveau mot de passe */}
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Nouveau mot de passe</label>
                            <div className="relative">
                              <input 
                                type={showNewPassword ? "text" : "password"}
                                name="newPassword"
                                autoComplete="new-password"
                                value={passwordForm.newPassword}
                                onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                                className="w-full p-3 pr-12 border border-[#E5E0DA] bg-white"
                                placeholder="Entrez votre nouveau mot de passe"
                              />
                              <button 
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)} 
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6560] hover:text-[#0A0A0A] transition-colors"
                              >
                                {showNewPassword ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Confirmer le mot de passe */}
                          <div>
                            <label className="block text-sm text-[#6B6560] mb-1">Confirmer le nouveau mot de passe</label>
                            <input 
                              type="password"
                              name="confirmPassword"
                              autoComplete="new-password"
                              value={passwordForm.confirmPassword}
                              onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                              className="w-full p-3 border border-[#E5E0DA] bg-white"
                              placeholder="Confirmez votre nouveau mot de passe"
                            />
                          </div>

                          <button 
                            onClick={handleChangePassword}
                            className="bg-[#0A0A0A] text-white px-6 py-3 uppercase text-sm tracking-wider hover:bg-[#6B6560] transition-colors"
                          >
                            Changer le mot de passe
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Addresses Tab */}
                  {dashboardTab === 'addresses' && (
                    <div>
                      {userAddresses.length === 0 ? (
                        <div className="text-center py-12 bg-[#EDE8E1]">
                          <p className="text-[#6B6560] mb-4">Aucune adresse enregistrée</p>
                          <button className="bg-[#9C7C5C] text-white px-6 py-2 uppercase text-sm tracking-wider hover:bg-[#8B6B4B] transition-colors">
                            Ajouter une adresse
                          </button>
                        </div>
                      ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                          {userAddresses.map(addr => (
                            <div key={addr.id} className="bg-white border border-[#E5E0DA] p-4">
                              <div className="flex justify-between mb-2">
                                <span className="font-medium">{addr.label}</span>
                                {addr.isDefault && (
                                  <span className="text-xs bg-[#9C7C5C] text-white px-2 py-1">Par défaut</span>
                                )}
                              </div>
                              <p className="text-sm text-[#6B6560]">
                                {addr.firstName} {addr.lastName}<br/>
                                {addr.address}<br/>
                                {addr.city}, {addr.country}<br/>
                                {addr.phone}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* ADMIN SECTION */}
        <section className={`page-section ${currentSection === 'admin' ? 'active' : ''}`} id="admin">
          <div className="min-h-screen pt-32 pb-24 bg-[#EDE8E1]">
            <div className="container mx-auto px-6 lg:px-12">
              {/* Access control */}
              {user?.role !== 'admin' && user?.role !== 'manager' ? (
                <div className="text-center py-16">
                  <h2 className="text-3xl font-display mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Accès non autorisé</h2>
                  <p className="text-[#6B6560] mb-8">Vous n'avez pas les permissions pour accéder à cette page.</p>
                  <button
                    onClick={() => navigateTo('home')}
                    className="bg-[#9C7C5C] text-white px-8 py-3 uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
                  >
                    Retour à l'accueil
                  </button>
                </div>
              ) : (
              <>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12">
                <div>
                  <p className="hero-subtitle text-[#9C7C5C] mb-4">{user?.role === 'admin' ? 'Administration' : 'Gestion'}</p>
                  <h1 className="font-display text-4xl lg:text-5xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{user?.role === 'admin' ? 'Panneau Admin' : 'Tableau de bord'}</h1>
                </div>
                {user?.role === 'admin' && (
                <button type="button" className="btn-primary mt-6 md:mt-0" style={{ width: 'auto' }} onClick={() => {
                  setEditingProduct(null)
                  setFormType('chaussure')
                  const chaussuresCat = menuCategories.find(c => c.slug === 'chaussures')
                  const defaultSubCat = chaussuresCat?.subCategories?.[0]?.slug || ''
                  setFormData({ name: '', category: defaultSubCat, subCategory: '', genre: 'femme', description: '', sizes: [], type: 'chaussure', isBestSeller: false, isNew: true, colors: [] })
                  setNewColor(null)
                  setShowProductFormModal(true)
                }}>
                  <span>+ Nouveau Produit</span>
                </button>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
                <div className="bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-2">Total Produits</p>
                  <p className="font-display text-3xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{products.length}</p>
                </div>
                <div className="bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-2">Alertes Stock</p>
                  <p className="font-display text-3xl text-red-600" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{products.filter(p => p.totalStock < 5).length}</p>
                </div>
                <div className="bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-2">Commandes</p>
                  <p className="font-display text-3xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{adminOrders.length}</p>
                </div>
                <div className="bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-2">En attente</p>
                  <p className="font-display text-3xl text-yellow-600" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{adminOrders.filter(o => o.status === 'pending').length}</p>
                </div>
                <div className="bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-2">Slides Hero</p>
                  <p className="font-display text-3xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{heroSlides.length}</p>
                </div>
              </div>

              {/* Admin Tabs */}
              <div className="flex gap-4 border-b border-[#E5E0DA] mb-8">
                {[
                  { id: 'products', label: 'Produits', roles: ['admin'] },
                  { id: 'orders', label: 'Commandes', roles: ['admin', 'manager'] },
                  { id: 'users', label: 'Utilisateurs', roles: ['admin'] }
                ].filter(tab => tab.roles.includes(user?.role || '')).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { 
                      setAdminTab(tab.id as 'products' | 'orders' | 'users')
                      if (tab.id === 'users') fetchAdminUsers()
                    }}
                    className={`py-3 px-4 text-sm uppercase tracking-wider transition-colors ${
                      adminTab === tab.id
                        ? 'border-b-2 border-[#9C7C5C] text-[#9C7C5C]'
                        : 'text-[#6B6560] hover:text-[#0A0A0A]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Orders Tab */}
              {adminTab === 'orders' && (
                <div className="space-y-6">
                  {/* Order Filters */}
                  <div className="flex flex-wrap gap-3 mb-6">
                    {[
                      { id: 'all', label: 'Toutes' },
                      { id: 'pending', label: 'En attente' },
                      { id: 'paid', label: 'Payées' },
                      { id: 'processing', label: 'En préparation' },
                      { id: 'shipped', label: 'Expédiées' },
                      { id: 'delivered', label: 'Livrées' }
                    ].map(filter => (
                      <button
                        key={filter.id}
                        onClick={() => setAdminOrderFilter(filter.id)}
                        className={`px-4 py-2 text-sm uppercase tracking-wider transition-colors ${
                          adminOrderFilter === filter.id
                            ? 'bg-[#9C7C5C] text-white'
                            : 'bg-white text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#9C7C5C]'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {/* Orders List */}
                  {adminOrders.filter(o => adminOrderFilter === 'all' || o.status === adminOrderFilter).length === 0 ? (
                    <div className="bg-white p-12 text-center">
                      <p className="text-[#6B6560]">Aucune commande à afficher</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {adminOrders
                        .filter(o => adminOrderFilter === 'all' || o.status === adminOrderFilter)
                        .map(order => (
                          <div key={order.id} className="bg-white p-6 shadow-sm">
                            <div className="flex flex-col lg:flex-row justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-4 mb-3">
                                  <h3 className="font-medium text-lg">{order.orderNumber}</h3>
                                  <span className={`inline-block px-3 py-1 text-xs uppercase tracking-wider ${
                                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    order.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                                    order.status === 'processing' ? 'bg-indigo-100 text-indigo-800' :
                                    order.status === 'shipped' ? 'bg-purple-100 text-purple-800' :
                                    order.status === 'delivered' ? 'bg-[#15803D]/10 text-[#15803D]' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {order.status === 'pending' ? 'En attente' :
                                     order.status === 'paid' ? 'Payée' :
                                     order.status === 'processing' ? 'En préparation' :
                                     order.status === 'shipped' ? 'Expédiée' :
                                     order.status === 'delivered' ? 'Livrée' : order.status}
                                  </span>
                                  <span className={`inline-block px-3 py-1 text-xs uppercase tracking-wider ${
                                    order.paymentStatus === 'paid' ? 'bg-[#15803D]/10 text-[#15803D]' :
                                    order.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {order.paymentStatus === 'paid' ? 'Payé' : 
                                     order.paymentStatus === 'pending' ? 'Paiement en attente' : order.paymentStatus}
                                  </span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-[#6B6560]">Client:</p>
                                    <p>{order.customerFirstName} {order.customerLastName}</p>
                                    <p className="text-[#6B6560]">{order.customerEmail}</p>
                                    <p className="text-[#6B6560]">{order.customerPhone}</p>
                                  </div>
                                  <div>
                                    <p className="text-[#6B6560]">Livraison:</p>
                                    <p>{order.shippingAddress || 'Non spécifiée'}</p>
                                    <p>{order.shippingCity || ''} {order.shippingCountry || ''}</p>
                                  </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-[#E5E0DA]">
                                  <p className="text-[#6B6560] text-xs uppercase tracking-wider mb-2">Articles:</p>
                                  {order.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-sm py-1">
                                      <span>{item.productName} - {item.size}{item.colorName ? `, ${item.colorName}` : ''} x{item.quantity}</span>
                                      <span>{formatPrice(item.totalPrice)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between font-medium mt-2 pt-2 border-t border-[#E5E0DA]">
                                    <span>Total</span>
                                    <span>{formatPrice(order.total)}</span>
                                  </div>
                                </div>

                                {order.trackingNumber && (
                                  <div className="mt-4 p-3 bg-[#EDE8E1] text-sm">
                                    <p><strong>Numéro de suivi:</strong> {order.trackingNumber}</p>
                                  </div>
                                )}

                                <p className="text-xs text-[#6B6560] mt-4">
                                  Créée le {new Date(order.createdAt).toLocaleDateString('fr-FR')} à {new Date(order.createdAt).toLocaleTimeString('fr-FR')}
                                </p>
                              </div>

                              {/* Actions */}
                              <div className="flex flex-col gap-2 lg:w-48">
                                <select
                                  value={order.status}
                                  onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                  className="p-2 border border-[#E5E0DA] text-sm"
                                >
                                  <option value="pending">En attente</option>
                                  <option value="paid">Payée</option>
                                  <option value="processing">En préparation</option>
                                  <option value="shipped">Expédiée</option>
                                  <option value="delivered">Livrée</option>
                                  <option value="cancelled">Annulée</option>
                                </select>

                                {order.status === 'shipped' && !order.trackingNumber && (
                                  <input
                                    type="text"
                                    placeholder="Numéro de suivi"
                                    className="p-2 border border-[#E5E0DA] text-sm"
                                    onBlur={(e) => {
                                      if (e.target.value) {
                                        updateOrderStatus(order.id, order.status, e.target.value)
                                      }
                                    }}
                                  />
                                )}

                                <a
                                  href={getWhatsAppLink(`Bonjour, concernant votre commande ${order.orderNumber}...`)}
                                  target="_blank"
                                  rel="noopener"
                                  className="bg-[#9C7C5C] text-white text-center py-2 text-xs uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
                                >
                                  Contacter client
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Products Tab */}
              {adminTab === 'products' && (
                <>
              <div className="bg-white p-6 shadow-sm mb-8">
                <h3 className="font-display text-lg text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Logo du Site</h3>
                <div className="flex items-center gap-6">
                  <div className="w-32 h-32 bg-[#EDE8E1] flex items-center justify-center overflow-hidden">
                    <img src={logo || '/logo.png'} alt="Logo actuel" className="max-w-full max-h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[#6B6560] mb-4">Le logo apparaît dans le header et le footer du site.</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-[#F8F6F3] cursor-pointer hover:bg-[#9C7C5C] transition-colors text-sm uppercase tracking-wider">
                      <span>Changer le logo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          try {
                            const compressedBase64 = await compressImage(file, 600, 0.9)
                            const res = await fetch('/api/settings/logo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: compressedBase64 }) })
                            if (res.ok) { setLogo(compressedBase64); showToast("Succès", "Le logo a été mis à jour avec succès") }
                            else { showToast("Erreur", "Impossible de mettre à jour le logo", "error") }
                          } catch (error) { showToast("Erreur", "Erreur lors du traitement du logo", "error") }
                        }
                      }} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Maison Image Management */}
              <div className="bg-white p-6 shadow-sm mb-8">
                <h3 className="font-display text-lg text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Image "Notre Maison"</h3>
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="w-full md:w-64 h-48 bg-[#EDE8E1] flex items-center justify-center overflow-hidden">
                    <img src={maisonImage || 'https://placehold.co/800x600?text=Atelier'} alt="Image Notre Maison" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/800x600?text=Atelier' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[#6B6560] mb-4">Cette image apparaît dans la section "Notre Maison" pour présenter votre atelier ou savoir-faire artisanal.</p>
                    <div className="flex gap-3">
                      <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-[#F8F6F3] cursor-pointer hover:bg-[#9C7C5C] transition-colors text-sm uppercase tracking-wider">
                        <span>Changer l&apos;image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            try {
                              const compressedBase64 = await compressImage(file, 1200, 0.85)
                              const res = await fetch('/api/settings/maison-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: compressedBase64 }) })
                              if (res.ok) { setMaisonImage(compressedBase64); showToast("Succès", "L'image a été mise à jour avec succès") }
                              else { showToast("Erreur", "Impossible de mettre à jour l'image", "error") }
                            } catch (error) { showToast("Erreur", "Erreur lors du traitement de l'image", "error") }
                          }
                        }} />
                      </label>
                      {maisonImage && (
                        <button onClick={async () => {
                          if (confirm('Supprimer cette image ?')) {
                            try {
                              const res = await fetch('/api/settings/maison-image', { method: 'DELETE' })
                              if (res.ok) { setMaisonImage(null); showToast("Succès", "L'image a été supprimée") }
                              else { showToast("Erreur", "Impossible de supprimer l'image", "error") }
                            } catch (error) { showToast("Erreur", "Erreur lors de la suppression", "error") }
                          }
                        }} className="px-4 py-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors text-sm uppercase tracking-wider">Supprimer</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hero Slides Management */}
              <div className="bg-white p-6 shadow-sm mb-8">
                <h3 className="font-display text-lg text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Images et Vidéos du Hero Slider</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {heroSlides.map((slide) => (
                    <div key={slide.id} className="relative aspect-video bg-[#EDE8E1] overflow-hidden group">
                      {slide.type === 'video' ? <video src={slide.image} className="w-full h-full object-cover" muted /> : <img src={slide.image} alt="" className="w-full h-full object-cover" />}
                      {slide.type === 'video' && <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">Vidéo</div>}
                      <button className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                        if (confirm('Supprimer ce média ?')) {
                          await fetch(`/api/slides/${slide.id}`, { method: 'DELETE' })
                          setHeroSlides(prev => prev.filter(s => s.id !== slide.id))
                          showToast("Succès", "Le média a été supprimé")
                        }
                      }}>×</button>
                    </div>
                  ))}
                  <label className="aspect-video bg-[#EDE8E1] border-2 border-dashed border-[#6B6560] flex flex-col items-center justify-center cursor-pointer hover:border-[#9C7C5C] transition-colors">
                    <svg className="w-6 h-6 text-[#6B6560] mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-[#6B6560] text-xs">+ Image</span>
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        try {
                          const compressedBase64 = await compressImage(file, 1920, 0.85)
                          const res = await fetch('/api/slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: compressedBase64, type: 'image', interval: 5000 }) })
                          if (res.ok) { const newSlide = await res.json(); setHeroSlides(prev => [...prev, newSlide]); showToast("Succès", "L'image a été ajoutée au slider") }
                          else { showToast("Erreur", "Impossible d'ajouter l'image", "error") }
                        } catch (error) { showToast("Erreur", "Erreur lors du traitement de l'image", "error") }
                      }
                    }} />
                  </label>
                </div>
              </div>

              {/* Subcategories Management */}
              <div className="bg-white p-6 shadow-sm mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-lg text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Sous-catégories du Menu</h3>
                  <button onClick={() => {
                    setEditingSubCat({ id: null, name: '', genre: 'all', menuCategoryId: menuCategories[0]?.id || '' })
                    setShowSubCatModal(true)
                  }} className="px-4 py-2 bg-[#0A0A0A] text-[#F8F6F3] text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors">+ Nouvelle sous-catégorie</button>
                </div>
                
                {menuCategories.map((category) => (
                  <div key={category.id} className="mb-6 last:mb-0">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm uppercase tracking-widest text-[#9C7C5C] font-bold">{category.name}</h4>
                      <button onClick={() => {
                        setEditingSubCat({ id: null, name: '', genre: 'all', menuCategoryId: category.id })
                        setShowSubCatModal(true)
                      }} className="text-xs text-[#6B6560] hover:text-[#0A0A0A] transition-colors">+ Ajouter</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#EDE8E1]">
                            <th className="text-left p-3 text-xs uppercase tracking-widest text-[#6B6560]">Nom</th>
                            <th className="text-left p-3 text-xs uppercase tracking-widest text-[#6B6560]">Slug</th>
                            <th className="text-left p-3 text-xs uppercase tracking-widest text-[#6B6560]">Genre</th>
                            <th className="text-left p-3 text-xs uppercase tracking-widest text-[#6B6560]">Images</th>
                            <th className="text-left p-3 text-xs uppercase tracking-widest text-[#6B6560]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {category.subCategories?.map((subCat) => (
                            <tr key={subCat.id} className="border-b border-[#E5E0DA] hover:bg-[#F8F6F3]">
                              <td className="p-3 font-medium">{subCat.name}</td>
                              <td className="p-3 text-[#6B6560]">{subCat.slug}</td>
                              <td className="p-3">
                                <span className={`inline-block px-2 py-1 rounded text-xs ${subCat.genre === 'femme' ? 'bg-pink-100 text-pink-800' : subCat.genre === 'homme' ? 'bg-blue-100 text-blue-800' : subCat.genre === 'mixte' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {subCat.genre === 'femme' ? 'Femme' : subCat.genre === 'homme' ? 'Homme' : subCat.genre === 'mixte' ? 'Mixte' : 'Tous'}
                                </span>
                              </td>
                              <td className="p-3">{subCat.images?.length || 0}</td>
                              <td className="p-3">
                                <button onClick={() => {
                                  setEditingSubCat({ 
                                    id: subCat.id, 
                                    name: subCat.name, 
                                    genre: subCat.genre, 
                                    menuCategoryId: category.id 
                                  })
                                  setShowSubCatModal(true)
                                }} className="text-[#9C7C5C] hover:text-[#0A0A0A] text-xs uppercase font-bold mr-3">Modifier</button>
                                <button onClick={async () => {
                                  if (confirm('Supprimer cette sous-catégorie ?')) {
                                    await fetch(`/api/subcategories?id=${subCat.id}`, { method: 'DELETE' })
                                    const menuRes = await fetch('/api/menu')
                                    if (menuRes.ok) setMenuCategories(await menuRes.json())
                                    showToast("Succès", "La sous-catégorie a été supprimée")
                                  }
                                }} className="text-red-600 hover:text-red-800 text-xs uppercase font-bold">Supprimer</button>
                              </td>
                            </tr>
                          ))}
                          {(!category.subCategories || category.subCategories.length === 0) && (
                            <tr><td colSpan={5} className="p-4 text-center text-[#6B6560]">Aucune sous-catégorie</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>

              {/* Menu Images Management */}
              <div className="bg-white p-6 shadow-sm mb-8">
                <h3 className="font-display text-lg text-[#0A0A0A] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Images du Méga-Menu</h3>
                <p className="text-sm text-[#6B6560] mb-6">Ajoutez des images pour chaque sous-catégorie. Ces images apparaîtront dans le menu intelligent au survol.</p>
                
                {menuCategories.map((category) => (
                  <div key={category.id} className="mb-8 last:mb-0">
                    <h4 className="text-sm uppercase tracking-widest text-[#9C7C5C] mb-4 font-bold">{category.name}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {category.subCategories?.map((subCat) => (
                        <div key={subCat.id} className="border border-[#E5E0DA] p-4 bg-[#F8F6F3]">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <p className="font-medium text-[#0A0A0A]">{subCat.name}</p>
                              <p className="text-xs text-[#6B6560]">{subCat.genre === 'femme' ? 'Femme' : subCat.genre === 'homme' ? 'Homme' : subCat.genre === 'mixte' ? 'Mixte' : 'Tous'}</p>
                            </div>
                            <span className="text-xs bg-[#EDE8E1] px-2 py-1 rounded">{subCat.images?.length || 0} image(s)</span>
                          </div>
                          
                          {/* Images existantes */}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {subCat.images?.map((img) => (
                              <div key={img.id} className="relative aspect-[3/4] bg-[#EDE8E1] overflow-hidden group">
                                <img src={img.image} alt={img.title || ''} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x133?text=Image' }} />
                                <button className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                                  if (confirm('Supprimer cette image ?')) {
                                    await fetch(`/api/menu/${subCat.id}/images?imageId=${img.id}`, { method: 'DELETE' })
                                    // Refresh menu data
                                    const res = await fetch('/api/menu')
                                    if (res.ok) setMenuCategories(await res.json())
                                    showToast("Succès", "L'image a été supprimée")
                                  }
                                }}>×</button>
                              </div>
                            ))}
                          </div>
                          
                          {/* Ajouter image */}
                          <label className="flex items-center justify-center gap-2 py-2 border-2 border-dashed border-[#6B6560] cursor-pointer hover:border-[#9C7C5C] transition-colors">
                            <svg className="w-4 h-4 text-[#6B6560]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                            <span className="text-xs text-[#6B6560]">Ajouter</span>
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                try {
                                  const compressedBase64 = await compressImage(file, 400, 0.8)
                                  const res = await fetch(`/api/menu/${subCat.id}/images`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ image: compressedBase64 })
                                  })
                                  if (res.ok) {
                                    const menuRes = await fetch('/api/menu')
                                    if (menuRes.ok) setMenuCategories(await menuRes.json())
                                    showToast("Succès", "L'image a été ajoutée au menu")
                                  } else {
                                    showToast("Erreur", "Impossible d'ajouter l'image", "error")
                                  }
                                } catch (error) {
                                  showToast("Erreur", "Erreur lors du traitement", "error")
                                }
                              }
                            }} />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Products Table */}
              <div className="bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#EDE8E1]">
                        <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Image</th>
                        <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Produit</th>
                        <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Genre</th>
                        <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Prix</th>
                        <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Stock</th>
                        <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id} className="border-b border-[#E5E0DA] hover:bg-gray-50">
                          <td className="p-4"><img src={p.image} alt={p.name} className="w-12 h-12 object-cover bg-[#EDE8E1]" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100' }} /></td>
                          <td className="p-4"><p className="font-display font-bold text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{p.name}</p><p className="text-xs text-[#6B6560] truncate max-w-[150px]">{p.subCategory || ''}</p></td>
                          <td className="p-4"><span className={`inline-block px-2 py-1 rounded text-xs font-bold ${p.genre === 'homme' ? 'bg-blue-100 text-blue-800' : p.genre === 'femme' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'}`}>{p.genre === 'homme' ? 'Homme' : p.genre === 'femme' ? 'Femme' : 'Mixte'}</span></td>
                          <td className="p-4 font-mono">{p.minPrice > 0 ? <><span className="text-xs text-[#6B6560]">À partir de </span>{formatPrice(p.minPrice)}</> : 'Prix sur demande'}</td>
                          <td className="p-4"><span className={`inline-block px-2 py-1 rounded text-xs font-bold ${(p.totalStock || 0) === 0 ? 'bg-red-100 text-red-800' : (p.totalStock || 0) < 5 ? 'bg-orange-100 text-orange-800' : 'bg-[#15803D]/10 text-[#15803D]'}`}>{(p.totalStock || 0) === 0 ? 'Rupture' : (p.totalStock || 0) < 5 ? `Faible (${p.totalStock})` : p.totalStock}</span></td>
                          <td className="p-4">
                            <button onClick={() => openEditProduct(p)} className="text-[#9C7C5C] hover:text-[#0A0A0A] text-xs uppercase font-bold mr-3">Modifier</button>
                            <button onClick={() => deleteProduct(p.id)} className="text-red-600 hover:text-red-800 text-xs uppercase font-bold">Supprimer</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {products.length === 0 && <div className="p-12 text-center text-[#6B6560]">Aucun produit dans la base de données.</div>}
              </div>
                </>
              )}

              {/* Users Tab */}
              {adminTab === 'users' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-display text-lg text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Gestion des utilisateurs</h3>
                    <button 
                      onClick={() => {
                        setEditingUser(null)
                        setNewUserData({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'customer' })
                        setShowUserForm(true)
                      }}
                      className="px-4 py-2 bg-[#0A0A0A] text-[#F8F6F3] text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors"
                    >
                      + Nouvel utilisateur
                    </button>
                  </div>

                  {/* User Form Modal */}
                  {showUserForm && (
                    <div className="bg-white p-6 shadow-sm mb-6">
                      <h4 className="font-medium mb-4">{editingUser ? 'Modifier l\'utilisateur' : 'Créer un nouvel utilisateur'}</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#6B6560] mb-1">Email *</label>
                          <input 
                            type="email" 
                            value={editingUser ? editingUser.email : newUserData.email}
                            onChange={(e) => !editingUser && setNewUserData({...newUserData, email: e.target.value})}
                            disabled={!!editingUser}
                            className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C] disabled:bg-[#EDE8E1]"
                          />
                        </div>
                        {!editingUser && (
                          <div>
                            <label className="block text-xs text-[#6B6560] mb-1">Mot de passe *</label>
                            <input 
                              type="password" 
                              value={newUserData.password}
                              onChange={(e) => setNewUserData({...newUserData, password: e.target.value})}
                              className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-[#6B6560] mb-1">Prénom</label>
                          <input 
                            type="text" 
                            value={editingUser ? editingUser.firstName || '' : newUserData.firstName}
                            onChange={(e) => editingUser 
                              ? setEditingUser({...editingUser, firstName: e.target.value})
                              : setNewUserData({...newUserData, firstName: e.target.value})
                            }
                            className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#6B6560] mb-1">Nom</label>
                          <input 
                            type="text" 
                            value={editingUser ? editingUser.lastName || '' : newUserData.lastName}
                            onChange={(e) => editingUser 
                              ? setEditingUser({...editingUser, lastName: e.target.value})
                              : setNewUserData({...newUserData, lastName: e.target.value})
                            }
                            className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#6B6560] mb-1">Téléphone</label>
                          <input 
                            type="tel" 
                            value={editingUser ? editingUser.phone || '' : newUserData.phone}
                            onChange={(e) => editingUser 
                              ? setEditingUser({...editingUser, phone: e.target.value})
                              : setNewUserData({...newUserData, phone: e.target.value})
                            }
                            className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#6B6560] mb-1">Rôle</label>
                          <select 
                            value={editingUser ? editingUser.role : newUserData.role}
                            onChange={(e) => editingUser 
                              ? setEditingUser({...editingUser, role: e.target.value})
                              : setNewUserData({...newUserData, role: e.target.value})
                            }
                            className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                          >
                            <option value="customer">Client</option>
                            <option value="manager">Manager / Gestionnaire</option>
                            <option value="admin">Administrateur</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-6">
                        <button 
                          onClick={() => editingUser ? handleUpdateUser(editingUser.id, editingUser) : handleCreateUser()}
                          className="px-6 py-2 bg-[#9C7C5C] text-white text-sm uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
                        >
                          {editingUser ? 'Enregistrer' : 'Créer'}
                        </button>
                        <button 
                          onClick={() => { setShowUserForm(false); setEditingUser(null) }}
                          className="px-6 py-2 border border-[#E5E0DA] text-[#0A0A0A] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Users List */}
                  <div className="bg-white shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-[#EDE8E1]">
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Email</th>
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Nom</th>
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Téléphone</th>
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Rôle</th>
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Statut</th>
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Commandes</th>
                            <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map((u) => (
                            <tr key={u.id} className="border-b border-[#E5E0DA] hover:bg-gray-50">
                              <td className="p-4">
                                <p className="font-medium text-[#0A0A0A]">{u.email}</p>
                              </td>
                              <td className="p-4">
                                <p className="text-[#0A0A0A]">{u.firstName} {u.lastName}</p>
                              </td>
                              <td className="p-4">
                                <p className="text-[#6B6560]">{u.phone || '-'}</p>
                              </td>
                              <td className="p-4">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                  u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                  u.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Manager' : 'Client'}
                                </span>
                              </td>
                              <td className="p-4">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                  u.isActive ? 'bg-[#15803D]/10 text-[#15803D]' : 'bg-red-100 text-red-800'
                                }`}>
                                  {u.isActive ? 'Actif' : 'Inactif'}
                                </span>
                              </td>
                              <td className="p-4">
                                <p className="text-[#6B6560]">{(u as { _count?: { orders: number } })._count?.orders || 0}</p>
                              </td>
                              <td className="p-4">
                                <button 
                                  onClick={() => {
                                    setEditingUser(u)
                                    setShowUserForm(true)
                                  }}
                                  className="text-[#9C7C5C] hover:text-[#0A0A0A] text-xs uppercase font-bold mr-3"
                                >
                                  Modifier
                                </button>
                                <button 
                                  onClick={() => handleUpdateUser(u.id, { isActive: !u.isActive })}
                                  className="text-[#6B6560] hover:text-[#0A0A0A] text-xs uppercase font-bold mr-3"
                                >
                                  {u.isActive ? 'Désactiver' : 'Activer'}
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="text-red-600 hover:text-red-800 text-xs uppercase font-bold"
                                >
                                  Supprimer
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {adminUsers.length === 0 && (
                      <div className="p-12 text-center text-[#6B6560]">Aucun utilisateur dans la base de données.</div>
                    )}
                  </div>
                </div>
              )}
              </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0A0A0A] text-[#F8F6F3] py-16">
        <div className="container mx-auto px-6 lg:px-12 text-center">
          <img src={logo || '/logo.png'} alt="MAISON KHAN Logo" className="h-16 w-auto object-contain mx-auto mb-4 cursor-pointer hover:opacity-80 transition-opacity" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png' }} onClick={() => navigateTo('home')} />
          <h4 className="font-display text-2xl mb-4 cursor-pointer hover:text-[#9C7C5C] transition-colors" style={{ fontFamily: "'Cormorant Garamond', serif" }} onClick={() => navigateTo('home')}>MAISON KHAN</h4>
          <p className="text-[#6B6560] text-sm mb-2">
            <span className="cursor-pointer hover:text-[#9C7C5C] transition-colors" onClick={() => navigateTo('maison')}>Notre Maison</span>
            <span className="mx-2">•</span>
            <span className="cursor-pointer hover:text-[#9C7C5C] transition-colors" onClick={() => navigateTo('catalogue')}>Chaussures</span>
            <span className="mx-2">•</span>
            <span className="cursor-pointer hover:text-[#9C7C5C] transition-colors" onClick={() => navigateTo('accessoires')}>Accessoires</span>
          </p>
          <p className="text-[#6B6560]/70 text-xs mb-1 tracking-wider">
            Chaussures de luxe artisanales
          </p>
          <p className="text-[#6B6560]/70 text-xs mb-8 tracking-wider">Made in Africa</p>
          <div className="flex justify-center gap-6 mb-8">
            <a href="https://www.tiktok.com/@maison..khan7" target="_blank" rel="noopener" className="text-[#6B6560] hover:text-[#F8F6F3] transition-colors" aria-label="TikTok">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
            </a>
            <a href="https://www.instagram.com/maisonkhan7/?hl=fr" target="_blank" rel="noopener" className="text-[#6B6560] hover:text-[#F8F6F3] transition-colors" aria-label="Instagram">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
            <a href="https://web.facebook.com/p/Maison-KHAN-61558748014717/?_rdc=1&_rdr" target="_blank" rel="noopener" className="text-[#6B6560] hover:text-[#F8F6F3] transition-colors" aria-label="Facebook">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
          </div>
          <div className="border-t border-[#6B6560]/20 pt-8">
            <p className="text-[#6B6560] text-xs">© {new Date().getFullYear()} MAISON KHAN. Tous droits réservés.</p>
          </div>
        </div>
      </footer>

      {/* Product Modal */}
      {mounted && showProductModal && currentProduct && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]" onClick={() => setShowProductModal(false)}>
          <div className="bg-[#F8F6F3] w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Images Section - changes with color */}
              <div className="relative">
                {(() => {
                  const selectedColor = currentProduct.colors?.find(c => c.colorValue === selectedColorValue)
                  const images = selectedColor?.images || [currentProduct.image]
                  return (
                    <div className="aspect-square bg-[#EDE8E1]">
                      {images[0] ? (
                        <img src={images[0]} alt={currentProduct.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x600?text=Image' }} />
                      ) : (
                        <img src={currentProduct.image} alt={currentProduct.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x600?text=Image' }} />
                      )}
                    </div>
                  )
                })()}
                <button onClick={() => setShowProductModal(false)} className="absolute top-4 right-4 w-10 h-10 bg-white/80 backdrop-blur-sm flex items-center justify-center text-[#0A0A0A] hover:bg-white transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              
              {/* Details Section */}
              <div className="p-8">
                <div className="mb-6">
                  <p className="text-xs tracking-widest uppercase text-[#6B6560] mb-2">{currentProduct.subCategory || currentProduct.category}</p>
                  <h2 className="font-display text-3xl text-[#0A0A0A] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{currentProduct.name}</h2>
                  <div className="text-lg text-[#0A0A0A]">
                    {(() => {
                      const selectedColor = currentProduct.colors?.find(c => c.colorValue === selectedColorValue)
                      if (selectedColor?.sizes?.length) {
                        const prices = selectedColor.sizes.filter(s => s.price > 0).map(s => s.price)
                        if (prices.length > 0) {
                          const minPrice = Math.min(...prices)
                          return <><span className="text-xs text-[#6B6560]">À partir de </span>{formatPrice(minPrice)}</>
                        }
                      }
                      return currentProduct.minPrice > 0 ? <><span className="text-xs text-[#6B6560]">À partir de </span>{formatPrice(currentProduct.minPrice)}</> : 'Prix sur demande'
                    })()}
                  </div>
                </div>

                <p className="text-[#6B6560] mb-8">{currentProduct.description}</p>
                
                {/* Color Swatches */}
                {currentProduct.colors && currentProduct.colors.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-xs tracking-widest uppercase text-[#0A0A0A] mb-3">Couleurs disponibles</label>
                    <div className="flex flex-wrap gap-3">
                      {currentProduct.colors.map((color) => {
                        const colorStock = color.sizes?.reduce((sum, s) => sum + s.stock, 0) || 0
                        return (
                          <button key={color.id} type="button" className={`relative group flex items-center gap-2 px-3 py-2 border transition-all ${selectedColorValue === color.colorValue ? 'border-[#0A0A0A] bg-[#0A0A0A]/5' : 'border-[#E5E0DA] hover:border-[#0A0A0A]'}`} onClick={() => setSelectedColorValue(color.colorValue)}>
                            <span className="w-5 h-5 rounded-full border border-[#E5E0DA]" style={{ backgroundColor: getColorHex(color.colorValue) }} />
                            <span className={`text-sm ${selectedColorValue === color.colorValue ? 'text-[#0A0A0A] font-medium' : 'text-[#6B6560]'}`}>{color.colorName}</span>
                            {colorStock <= 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" title="Rupture de stock" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                {/* Size Selection */}
                <div className="mb-8">
                  <label className="block text-xs tracking-widest uppercase text-[#0A0A0A] mb-3">Pointure / Taille</label>
                  <div className="flex flex-wrap gap-2">
                    {currentProduct.sizes.map((size) => {
                      let sizePrice = 0
                      let sizeStock = 0
                      if (selectedColorValue && currentProduct.colors) {
                        const color = currentProduct.colors.find(c => c.colorValue === selectedColorValue)
                        if (color?.sizes) {
                          const sizeInfo = color.sizes.find(s => s.size === size)
                          if (sizeInfo) { sizePrice = sizeInfo.price; sizeStock = sizeInfo.stock }
                        }
                      }
                      return (
                        <button key={size} type="button" className={`relative px-4 py-2 border transition-colors ${selectedSize === size ? 'bg-[#0A0A0A] text-[#F8F6F3] border-[#0A0A0A]' : sizeStock === 0 && selectedColorValue ? 'border-[#E5E0DA] text-[#6B6560]/50 line-through cursor-not-allowed' : 'border-[#E5E0DA] text-[#6B6560] hover:border-[#0A0A0A]'}`} onClick={() => setSelectedSize(size)} disabled={!!selectedColorValue && sizeStock === 0}>
                          {size}
                          {selectedColorValue && sizePrice > 0 && <span className="ml-2 text-xs opacity-70">{formatPrice(sizePrice)}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <button className="btn-primary" onClick={() => {
                    if (!selectedSize) { alert('Veuillez sélectionner une taille'); return }
                    if (currentProduct.colors && currentProduct.colors.length > 0) {
                      if (!selectedColorValue) { alert('Veuillez sélectionner une couleur'); return }
                      const color = currentProduct.colors.find(c => c.colorValue === selectedColorValue)
                      if (color?.sizes) {
                        const sizeInfo = color.sizes.find(s => s.size === selectedSize)
                        const price = sizeInfo?.price || 0
                        addToCart(currentProduct, selectedSize, selectedColorValue, color.colorName, price)
                      }
                    } else {
                      addToCart(currentProduct, selectedSize, '', '', currentProduct.minPrice || 0)
                    }
                  }}><span>Ajouter au panier</span></button>
                  <button className="btn-outline-dark" onClick={() => {
                    if (!selectedSize) { showToast('Erreur', 'Veuillez sélectionner une taille', 'error'); return }
                    let price = currentProduct.minPrice || 0
                    let colorName = ''
                    if (currentProduct.colors && currentProduct.colors.length > 0) {
                      if (!selectedColorValue) { showToast('Erreur', 'Veuillez sélectionner une couleur', 'error'); return }
                      const color = currentProduct.colors.find(c => c.colorValue === selectedColorValue)
                      colorName = color?.colorName || ''
                      if (color?.sizes) {
                        const sizeInfo = color.sizes.find(s => s.size === selectedSize)
                        price = sizeInfo?.price || 0
                      }
                    }
                    setDirectOrder({
                      product: currentProduct,
                      size: selectedSize,
                      colorName: colorName,
                      colorValue: selectedColorValue || '',
                      price: price,
                      quantity: 1
                    })
                    setShowProductModal(false)
                    setShowCheckoutModal(true)
                    setCheckoutStep('info')
                  }}><span>Commander directement</span></button>
                  <a href={getWhatsAppLink(`Bonjour MAISON KHAN, je suis intéressé(e) par le modèle "${currentProduct.name}"${selectedSize ? `\nPointure: ${selectedSize}` : ''}${selectedColorValue ? `\nCouleur: ${currentProduct.colors?.find(c => c.colorValue === selectedColorValue)?.colorName || selectedColorValue}` : ''}`)} target="_blank" rel="noopener" className="btn-whatsapp inline-flex"><span>Commandez avec vos exigences</span></a>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Cart Modal */}
      {mounted && showCartModal && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]" onClick={() => setShowCartModal(false)}>
          <div className="bg-[#F8F6F3] w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-display text-3xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Votre Panier</h2>
                <button onClick={() => setShowCartModal(false)} className="text-[#6B6560] hover:text-[#0A0A0A]"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg></button>
              </div>
              {cart.length === 0 ? (<div className="text-[#6B6560] text-center py-8">Votre panier est vide.</div>) : (
                <>
                  <div className="space-y-4 mb-8 max-h-60 overflow-y-auto">
                    {cart.map((item, index) => (
                      <div key={index} className="flex justify-between items-center border-b border-[#6B6560]/10 pb-3">
                        <div><p className="font-display text-lg text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{item.name}</p><p className="text-xs text-[#6B6560]">Taille: {item.size}{item.colorName ? ` | Couleur: ${item.colorName}` : ''} | {formatPrice(item.price)}</p></div>
                        <div className="flex items-center gap-3"><span className="text-sm font-bold">{item.qty}x</span><button onClick={() => removeFromCart(index)} className="text-red-500 hover:text-red-700 text-xs uppercase tracking-wider">Suppr.</button></div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#6B6560]/20 pt-6 space-y-3">
                    <p className="text-right font-bold mb-4">Total: {formatPrice(cartTotal)}</p>
                    <button
                      onClick={() => { setShowCartModal(false); setShowCheckoutModal(true); setCheckoutStep('info'); }}
                      className="btn-primary w-full"
                    >
                      <span>Passer la commande</span>
                    </button>
                    <a href={getWhatsAppLink(`Bonjour MAISON KHAN, je souhaite commander :\n${cart.map(item => `- ${item.name} (Taille: ${item.size}${item.colorName ? `, Couleur: ${item.colorName}` : ''}) x${item.qty} - ${formatPrice(item.price * item.qty)}`).join('\n')}\n\nTotal: ${formatPrice(cartTotal)}`)} target="_blank" rel="noopener" className="btn-whatsapp inline-flex w-full justify-center"><span>Commander via WhatsApp</span></a>
                    <button onClick={() => setShowCartModal(false)} className="btn-outline-dark w-full"><span>Continuer mes achats</span></button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Admin Login Modal */}
      {mounted && showAdminModal && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]" onClick={() => { setShowAdminModal(false); setAdminPassword(''); setShowPassword(false) }}>
          <div className="bg-white w-full max-w-md p-8 text-center" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Administration</h2>
            <p className="text-[#6B6560] text-sm mb-6">Veuillez entrer le mot de passe pour continuer.</p>
            <div className="relative mb-4">
              <input type={showPassword ? "text" : "password"} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="w-full p-3 pr-12 border border-[#E5E0DA] text-center focus:outline-none focus:border-[#9C7C5C]" placeholder="Mot de passe" onKeyDown={(e) => { if (e.key === 'Enter') { if (adminPassword === 'Khan1975@@') { setIsAdmin(true); setShowAdminModal(false); setAdminPassword(''); navigateTo('admin') } else { alert('Mot de passe incorrect.') }}}} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6560] hover:text-[#0A0A0A] transition-colors">
                {showPassword ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
              </button>
            </div>
            <div className="flex gap-4">
              <button className="btn-primary flex-1" onClick={() => { if (adminPassword === 'Khan1975@@') { setIsAdmin(true); setShowAdminModal(false); setAdminPassword(''); navigateTo('admin') } else { alert('Mot de passe incorrect.') }}}>Connexion</button>
              <button onClick={() => { setShowAdminModal(false); setAdminPassword(''); setShowPassword(false) }} className="btn-outline-dark flex-1">Annuler</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Product Form Modal - Simplified */}
      {/* Product Form Modal */}
      {mounted && showProductFormModal && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]" onClick={closeProductForm}>
          <div className="bg-[#F8F6F3] w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-display text-2xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
                <button onClick={closeProductForm} className="text-[#6B6560] hover:text-[#0A0A0A]"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg></button>
              </div>
              
              <form onSubmit={handleProductSubmit}>
                {/* Type Selector */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-3">Type de produit</label>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => {
                      setFormType('chaussure')
                      const chaussuresCat = menuCategories.find(c => c.slug === 'chaussures')
                      const defaultCat = chaussuresCat?.subCategories?.[0]?.slug || ''
                      setFormData(prev => ({ ...prev, type: 'chaussure', category: defaultCat, sizes: [] }))
                    }} className={`flex-1 p-4 border transition-colors ${formType === 'chaussure' ? 'bg-[#0A0A0A] text-[#C4A77D] border-[#0A0A0A]' : 'border-[#6B6560] text-[#6B6560] hover:border-[#0A0A0A]'}`}>Chaussure</button>
                    <button type="button" onClick={() => {
                      setFormType('accessoire')
                      const accessoiresCat = menuCategories.find(c => c.slug === 'accessoires')
                      const defaultCat = accessoiresCat?.subCategories?.[0]?.slug || ''
                      setFormData(prev => ({ ...prev, type: 'accessoire', category: defaultCat, sizes: [] }))
                    }} className={`flex-1 p-4 border transition-colors ${formType === 'accessoire' ? 'bg-[#0A0A0A] text-[#C4A77D] border-[#0A0A0A]' : 'border-[#6B6560] text-[#6B6560] hover:border-[#0A0A0A]'}`}>Accessoire</button>
                  </div>
                </div>
                
                {/* Genre Selector */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-3">Genre</label>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, genre: 'femme' }))} className={`flex-1 p-4 border transition-colors ${formData.genre === 'femme' ? 'bg-[#0A0A0A] text-[#C4A77D] border-[#0A0A0A]' : 'border-[#6B6560] text-[#6B6560] hover:border-[#0A0A0A]'}`}>Femme</button>
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, genre: 'homme' }))} className={`flex-1 p-4 border transition-colors ${formData.genre === 'homme' ? 'bg-[#0A0A0A] text-[#C4A77D] border-[#0A0A0A]' : 'border-[#6B6560] text-[#6B6560] hover:border-[#0A0A0A]'}`}>Homme</button>
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, genre: 'mixte' }))} className={`flex-1 p-4 border transition-colors ${formData.genre === 'mixte' ? 'bg-[#0A0A0A] text-[#C4A77D] border-[#0A0A0A]' : 'border-[#6B6560] text-[#6B6560] hover:border-[#0A0A0A]'}`}>Mixte</button>
                  </div>
                </div>

                {/* Badges */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-3">Badges & Visibilité</label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-[#E5E0DA] hover:border-[#9C7C5C] transition-colors">
                      <input 
                        type="checkbox" 
                        checked={formData.isNew} 
                        onChange={(e) => setFormData(prev => ({ ...prev, isNew: e.target.checked }))}
                        className="w-5 h-5 accent-[#9C7C5C]"
                      />
                      <div>
                        <span className="text-sm font-medium">Nouveauté</span>
                        <p className="text-xs text-[#6B6560]">Afficher dans la section Nouveautés</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-[#E5E0DA] hover:border-[#9C7C5C] transition-colors">
                      <input 
                        type="checkbox" 
                        checked={formData.isBestSeller} 
                        onChange={(e) => setFormData(prev => ({ ...prev, isBestSeller: e.target.checked }))}
                        className="w-5 h-5 accent-[#9C7C5C]"
                      />
                      <div>
                        <span className="text-sm font-medium">⭐ Best-Seller</span>
                        <p className="text-xs text-[#6B6560]">Afficher dans la section Best-Sellers</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Nom du produit *</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]" required />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Catégorie</label>
                    <select value={formData.category} onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))} className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]">
                      {(() => {
                        const category = menuCategories.find(cat => (formType === 'chaussure' && cat.slug === 'chaussures') || (formType === 'accessoire' && cat.slug === 'accessoires'))
                        if (category?.subCategories?.length) return category.subCategories.map(sub => <option key={sub.id} value={sub.slug}>{sub.name}</option>)
                        return formType === 'chaussure' ? <><option value="mules">Mules</option><option value="sandales">Sandales</option></> : <><option value="sacs">Sacs</option><option value="ceintures">Ceintures</option></>
                      })()}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Sous-titre (Collection)</label>
                  <input type="text" value={formData.subCategory} onChange={(e) => setFormData(prev => ({ ...prev, subCategory: e.target.value }))} className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]" placeholder="Ex: Édition Limitée" />
                </div>

                <div className="mb-4">
                  <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Description</label>
                  <textarea value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C] min-h-[100px]" placeholder="Description du produit..." />
                </div>

                {/* Sizes Selection */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-3">{formType === 'chaussure' ? 'Pointures disponibles' : 'Tailles disponibles'} *</label>
                  <div className="flex flex-wrap gap-2">
                    {(formType === 'chaussure' ? SHOE_SIZES : ACCESSORY_SIZES).map((size) => (
                      <button key={size} type="button" onClick={() => toggleSize(size)} className={`px-4 py-2 border transition-colors ${formData.sizes.includes(size) ? 'bg-[#0A0A0A] text-[#F8F6F3] border-[#0A0A0A]' : 'border-[#E5E0DA] text-[#6B6560] hover:border-[#0A0A0A]'}`}>{size}</button>
                    ))}
                  </div>
                </div>

                {/* Colors Section */}
                <div className="mb-6 p-4 bg-[#EDE8E1] border border-[#E5E0DA]">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-xs uppercase tracking-widest text-[#0A0A0A] font-bold">Couleurs (Prix & Stock par taille)</label>
                    <button type="button" onClick={() => {
                      if (formData.sizes.length === 0) { showToast("Erreur", "Veuillez d'abord sélectionner les tailles disponibles", "error"); return }
                      const initialSizes = formData.sizes.map(size => ({ size, price: 0, stock: 0 }))
                      setNewColor({ colorName: '', colorValue: '#8B7355', images: [], sizes: initialSizes })
                      setEditingColorIndex(-1)
                    }} className="px-3 py-1.5 bg-[#0A0A0A] text-[#F8F6F3] text-xs uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors">+ Ajouter une couleur</button>
                  </div>

                  {/* Existing colors */}
                  {formData.colors.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {formData.colors.map((color, idx) => {
                        const colorStock = color.sizes?.reduce((sum, s) => sum + s.stock, 0) || 0
                        const minPrice = Math.min(...(color.sizes?.filter(s => s.price > 0).map(s => s.price) || [0]))
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-white border border-[#E5E0DA]">
                            <div className="flex items-center gap-3">
                              <span className="w-5 h-5 rounded-full border border-[#E5E0DA]" style={{ backgroundColor: getColorHex(color.colorValue) }} />
                              <span className="text-sm font-medium">{color.colorName}</span>
                              <span className="text-xs text-[#6B6560]">{minPrice > 0 ? `À partir de ${formatPrice(minPrice)}` : 'Prix non défini'} | Stock: {colorStock}</span>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => {
                                setNewColor({ 
                                  colorName: color.colorName, 
                                  colorValue: color.colorValue, 
                                  images: [...(color.images || [])], 
                                  sizes: color.sizes?.map(s => ({ ...s })) || [] 
                                })
                                setEditingColorIndex(idx)
                              }} className="text-[#9C7C5C] hover:text-[#0A0A0A] text-xs uppercase tracking-wider px-2 py-1 border border-[#9C7C5C] hover:border-[#0A0A0A]">Modifier</button>
                              <button type="button" onClick={() => setFormData(prev => ({ ...prev, colors: prev.colors.filter((_, i) => i !== idx) }))} className="text-red-500 hover:text-red-700 text-xs uppercase tracking-wider px-2 py-1 border border-red-300 hover:border-red-500">Supprimer</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* New/Edit Color Form */}
                  {newColor && (
                    <div className="mb-4 p-4 bg-white border border-[#E5E0DA]">
                      <h4 className="text-sm font-bold text-[#0A0A0A] mb-3">{editingColorIndex >= 0 ? 'Modifier la couleur' : 'Nouvelle couleur'}</h4>
                      
                      {/* Ligne 1: Color Picker + Hex + Nom */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        {/* Color Picker Natif */}
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Couleur *</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="color" 
                              value={newColor.colorValue || '#8B7355'} 
                              onChange={(e) => {
                                setNewColor(prev => prev ? { ...prev, colorValue: e.target.value } : null)
                              }}
                              className="w-12 h-12 cursor-pointer border-2 border-[#E5E0DA] rounded bg-transparent"
                            />
                            <span className="text-xs text-[#6B6560]">Cliquez pour choisir</span>
                          </div>
                        </div>
                        
                        {/* Code Hex */}
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Code Hex</label>
                          <input 
                            type="text" 
                            value={newColor.colorValue || ''} 
                            onChange={(e) => {
                              let hex = e.target.value
                              if (!hex.startsWith('#')) hex = '#' + hex
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
                                setNewColor(prev => prev ? { ...prev, colorValue: hex } : null)
                              }
                            }}
                            placeholder="#8B7355"
                            className="w-full p-2 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C] font-mono text-sm uppercase"
                          />
                        </div>
                        
                        {/* Nom de la couleur */}
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Nom de la couleur *</label>
                          <input 
                            type="text" 
                            value={newColor.colorName || ''} 
                            onChange={(e) => setNewColor(prev => prev ? { ...prev, colorName: e.target.value } : null)}
                            placeholder="Ex: Noir, Marron, Beige..."
                            className="w-full p-2 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                          />
                        </div>
                      </div>
                      
                      {/* Aperçu de la couleur */}
                      {newColor.colorValue && (
                        <div className="mb-4 flex items-center gap-3 p-3 bg-[#F8F6F3] border border-[#E5E0DA]">
                          <span 
                            className="w-8 h-8 rounded-full border-2 border-[#E5E0DA]" 
                            style={{ backgroundColor: newColor.colorValue }}
                          />
                          <span className="text-sm">
                            <strong>{newColor.colorName || 'Sans nom'}</strong>
                            <span className="text-[#6B6560] ml-2 font-mono">{newColor.colorValue}</span>
                          </span>
                        </div>
                      )}
                      <div className="mb-4">
                        <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Images</label>
                        <input type="file" accept="image/*" multiple onChange={async (e) => {
                          const files = e.target.files
                          if (files) {
                            showToast("Info", "Compression des images en cours...")
                            const compressedImages: string[] = []
                            for (const file of Array.from(files)) {
                              try { compressedImages.push(await compressImage(file, 800, 0.8)) } catch (err) { console.error('Error compressing image:', err) }
                            }
                            setNewColor(prev => prev ? { ...prev, images: [...prev.images, ...compressedImages] } : null)
                            if (compressedImages.length > 0) showToast("Succès", `${compressedImages.length} image(s) ajoutée(s)`)
                          }
                        }} className="w-full p-2 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]" />
                      </div>

                      {/* Images Preview */}
                      {newColor.images && newColor.images.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                          {newColor.images.map((img, idx) => (
                            <div key={idx} className="relative w-16 h-16">
                              <img src={img} alt="" className="w-full h-full object-cover border border-[#E5E0DA]" />
                              <button type="button" onClick={() => setNewColor(prev => prev ? { ...prev, images: prev.images.filter((_, i) => i !== idx) } : null)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Prix et Stock par taille */}
                      <div className="mb-4">
                        <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Prix et stock par {formType === 'chaussure' ? 'pointure' : 'taille'} *</label>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[#E5E0DA]">
                                <th className="text-left p-2 text-xs uppercase tracking-widest text-[#6B6560]">{formType === 'chaussure' ? 'Pointure' : 'Taille'}</th>
                                <th className="text-left p-2 text-xs uppercase tracking-widest text-[#6B6560]">Prix (XOF)</th>
                                <th className="text-left p-2 text-xs uppercase tracking-widest text-[#6B6560]">Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {newColor.sizes.map((sizeItem, idx) => (
                                <tr key={sizeItem.size} className="border-b border-[#E5E0DA]">
                                  <td className="p-2 font-medium">{sizeItem.size}</td>
                                  <td className="p-2"><input type="number" value={sizeItem.price || ''} onChange={(e) => { const newSizes = [...newColor.sizes]; newSizes[idx] = { ...sizeItem, price: parseInt(e.target.value) || 0 }; setNewColor(prev => prev ? { ...prev, sizes: newSizes } : null) }} className="w-full p-2 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]" min="0" placeholder="0" /></td>
                                  <td className="p-2"><input type="number" value={sizeItem.stock} onChange={(e) => { const newSizes = [...newColor.sizes]; newSizes[idx] = { ...sizeItem, stock: parseInt(e.target.value) || 0 }; setNewColor(prev => prev ? { ...prev, sizes: newSizes } : null) }} className="w-full p-2 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]" min="0" placeholder="0" /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button type="button" onClick={() => {
                          if (!newColor.colorValue) { showToast("Erreur", "Veuillez sélectionner une couleur", "error"); return }
                          if (!newColor.colorName?.trim()) { showToast("Erreur", "Veuillez entrer un nom pour la couleur", "error"); return }
                          // Check for duplicate color (only when adding new, not when editing)
                          if (editingColorIndex < 0 && formData.colors.some(c => c.colorValue === newColor.colorValue)) { showToast("Erreur", "Cette couleur existe déjà", "error"); return }
                          const totalStock = newColor.sizes.reduce((sum, s) => sum + s.stock, 0)
                          if (totalStock === 0) { showToast("Erreur", "Veuillez définir le stock pour au moins une taille", "error"); return }
                          
                          if (editingColorIndex >= 0) {
                            // Update existing color
                            setFormData(prev => ({
                              ...prev,
                              colors: prev.colors.map((c, i) => i === editingColorIndex 
                                ? { ...c, colorName: newColor.colorName, colorValue: newColor.colorValue, images: newColor.images, sizes: newColor.sizes }
                                : c
                              )
                            }))
                            showToast("Succès", "Couleur modifiée")
                          } else {
                            // Add new color
                            const color: ProductColor = { id: `temp-${Date.now()}`, productId: '', colorName: newColor.colorName, colorValue: newColor.colorValue, images: newColor.images, sizes: newColor.sizes, order: formData.colors.length }
                            setFormData(prev => ({ ...prev, colors: [...prev.colors, color] }))
                            showToast("Succès", "Couleur ajoutée")
                          }
                          setNewColor(null)
                          setEditingColorIndex(-1)
                        }} className="px-4 py-2 bg-[#0A0A0A] text-[#F8F6F3] text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors">{editingColorIndex >= 0 ? 'Enregistrer' : 'Ajouter'}</button>
                        <button type="button" onClick={() => { setNewColor(null); setEditingColorIndex(-1) }} className="px-4 py-2 border border-[#6B6560] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#0A0A0A] transition-colors">Annuler</button>
                      </div>
                    </div>
                  )}

                  {formData.colors.length === 0 && !newColor && (
                    <p className="text-sm text-[#6B6560] text-center py-4">Aucune couleur. Cliquez sur "Ajouter une couleur" pour commencer.</p>
                  )}
                </div>

                <div className="mt-8 flex gap-4">
                  <button type="button" onClick={closeProductForm} className="btn-outline-dark flex-1">Annuler</button>
                  <button type="submit" className="btn-primary flex-1">{editingProduct ? 'Mettre à jour' : 'Ajouter'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Subcategory Modal */}
      {/* Sub Category Modal */}
      {mounted && showSubCatModal && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]" onClick={() => setShowSubCatModal(false)}>
          <div className="bg-[#F8F6F3] w-full max-w-md p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-2xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                {editingSubCat.id ? 'Modifier la sous-catégorie' : 'Nouvelle sous-catégorie'}
              </h2>
              <button onClick={() => setShowSubCatModal(false)} className="text-[#6B6560] hover:text-[#0A0A0A]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!editingSubCat.name.trim()) {
                showToast("Erreur", "Le nom est requis", "error")
                return
              }
              
              try {
                let res
                if (editingSubCat.id) {
                  res = await fetch('/api/subcategories', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      id: editingSubCat.id, 
                      name: editingSubCat.name, 
                      genre: editingSubCat.genre 
                    })
                  })
                } else {
                  res = await fetch('/api/subcategories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      name: editingSubCat.name, 
                      menuCategoryId: editingSubCat.menuCategoryId, 
                      genre: editingSubCat.genre 
                    })
                  })
                }
                
                if (res.ok) {
                  const menuRes = await fetch('/api/menu')
                  if (menuRes.ok) setMenuCategories(await menuRes.json())
                  setShowSubCatModal(false)
                  showToast("Succès", editingSubCat.id ? "La sous-catégorie a été modifiée" : "La sous-catégorie a été ajoutée")
                } else {
                  showToast("Erreur", "Une erreur est survenue", "error")
                }
              } catch (error) {
                showToast("Erreur", "Une erreur est survenue", "error")
              }
            }}>
              {/* Nom */}
              <div className="mb-4">
                <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Nom *</label>
                <input 
                  type="text" 
                  value={editingSubCat.name} 
                  onChange={(e) => setEditingSubCat(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                  placeholder="Ex: Mules, Sandales, Sacs..."
                  autoFocus
                />
              </div>
              
              {/* Catégorie parente */}
              <div className="mb-4">
                <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Catégorie parente</label>
                <select 
                  value={editingSubCat.menuCategoryId} 
                  onChange={(e) => setEditingSubCat(prev => ({ ...prev, menuCategoryId: e.target.value }))}
                  className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                  disabled={!!editingSubCat.id}
                >
                  {menuCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Genre */}
              <div className="mb-6">
                <label className="block text-xs uppercase tracking-widest text-[#6B6560] mb-2">Genre</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'all', label: 'Tous', color: 'gray' },
                    { value: 'femme', label: 'Femme', color: 'pink' },
                    { value: 'homme', label: 'Homme', color: 'blue' },
                    { value: 'mixte', label: 'Mixte', color: 'purple' }
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEditingSubCat(prev => ({ ...prev, genre: option.value }))}
                      className={`py-2 px-2 text-xs uppercase tracking-wider border transition-colors ${
                        editingSubCat.genre === option.value 
                          ? option.color === 'pink' ? 'bg-pink-100 border-pink-500 text-pink-800' 
                            : option.color === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-800'
                            : option.color === 'purple' ? 'bg-purple-100 border-purple-500 text-purple-800'
                            : 'bg-[#0A0A0A] text-[#F8F6F3] border-[#0A0A0A]'
                          : 'border-[#E5E0DA] text-[#6B6560] hover:border-[#0A0A0A]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Boutons */}
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowSubCatModal(false)} className="btn-outline-dark flex-1">Annuler</button>
                <button type="submit" className="btn-primary flex-1">{editingSubCat.id ? 'Enregistrer' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      
      {/* Auth Modal */}
      {mounted && createPortal(authModalContent, document.body)}
      
      {/* Checkout Modal */}
      <CheckoutModal />
      
      {/* Phone Number Modal for Payment */}
      {showPhoneModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[350] flex items-center justify-center p-4" onClick={() => setShowPhoneModal(false)}>
          <div className="bg-[#F8F6F3] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-display" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Numéro de téléphone
              </h3>
              <button onClick={() => setShowPhoneModal(false)} className="text-[#6B6560] hover:text-[#0A0A0A]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-[#6B6560] mb-4">
              Entrez votre numéro de téléphone Mobile Money pour recevoir la demande de paiement {pendingNetwork === 'FLOOZ' ? 'Moov Money (Flooz)' : 'T-Money (Togocel)'}.
            </p>
            <div className="flex gap-2 mb-4">
              <span className="flex items-center px-3 py-3 bg-[#E5E0DA] text-sm">+228</span>
              <input
                type="tel"
                placeholder="90 12 34 56"
                value={paymentPhone}
                onChange={(e) => setPaymentPhone(e.target.value.replace(/[^0-9]/g, ''))}
                className="flex-1 p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                maxLength={8}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPhoneModal(false)}
                className="flex-1 border border-[#E5E0DA] py-3 hover:bg-[#EDE8E1] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (paymentPhone.length === 8 && pendingNetwork) {
                    executePayGatePayment(pendingNetwork, paymentPhone)
                  } else {
                    showToast('Erreur', 'Veuillez entrer un numéro valide (8 chiffres)', 'error')
                  }
                }}
                disabled={payGateLoading || paymentPhone.length !== 8}
                className="flex-1 bg-[#9C7C5C] text-white py-3 hover:bg-[#8B6B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {payGateLoading ? 'Traitement...' : 'Payer'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Toast Notifications */}
      {mounted && toasts.length > 0 && createPortal(
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-[400px] ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-[#9C7C5C] text-white'}`}>
              <p className="font-bold text-sm">{t.title}</p>
              <p className="text-sm opacity-90">{t.description}</p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
