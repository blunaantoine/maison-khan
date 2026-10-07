'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Film, Play, Pause, Scissors, Plus, RefreshCw } from 'lucide-react'

/**
 * Découpeuse vidéo du Hero Slider.
 *
 * Principe : la vidéo d'origine (même 200 Mo, même 4K) ne quitte JAMAIS
 * l'appareil de l'admin — elle est lue localement dans le navigateur, on
 * découpe l'extrait choisi (30 s max) et on le ré-encode à la volée en
 * MP4 léger (720p, ~2 Mb/s) via canvas + MediaRecorder. Seul cet extrait
 * optimisé est envoyé au serveur (≤ 9 Mo) : la boutique reste rapide même
 * en 3G, et il n'y a plus aucune limite sur la vidéo de départ.
 */

const MAX_CLIP_SECONDS = 30
const MIN_CLIP_SECONDS = 1
const DIRECT_MAX_BYTES = 9 * 1024 * 1024
const EXPORT_MAX_BYTES = 9 * 1024 * 1024

type Phase = 'empty' | 'loading' | 'ready' | 'exporting' | 'uploading'

interface VideoTrimmerProps {
  open: boolean
  onClose: () => void
  onAdded: (slide: Record<string, unknown> & { id: string }) => void
  onSuccess: (title: string, description: string) => void
  onError: (title: string, description: string) => void
}

/** File d'attente propre pour requestVideoFrameCallback (absent de vieux TS lib). */
interface FrameCallbackVideo extends HTMLVideoElement {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const d = Math.floor((s % 1) * 10)
  return `${m}:${String(sec).padStart(2, '0')}.${d}`
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(blob)
  })
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.05) { resolve(); return }
    const done = () => { v.removeEventListener('seeked', done); resolve() }
    v.addEventListener('seeked', done)
    v.currentTime = t
    setTimeout(done, 1500)
  })
}

export default function VideoTrimmer({ open, onClose, onAdded, onSuccess, onError }: VideoTrimmerProps) {
  const [phase, setPhase] = useState<Phase>('empty')
  const [file, setFile] = useState<File | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [progress, setProgress] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objUrlRef = useRef<string | null>(null)
  const previewRef = useRef(false)
  const startRef = useRef(0)
  const endRef = useRef(0)
  const phaseRef = useRef<Phase>('empty')
  const aliveRef = useRef(true)
  const durationReadyRef = useRef(false)

  phaseRef.current = phase
  startRef.current = start
  endRef.current = end

  const stopPreview = () => {
    previewRef.current = false
    setPreviewing(false)
    const v = videoRef.current
    if (v && !v.paused) v.pause()
  }

  /** Réinitialisation complète (à la fermeture). */
  const resetAll = () => {
    stopPreview()
    setError(null)
    setPhase('empty')
    setFile(null)
    setSrcUrl(null)
    setDuration(0)
    setStart(0)
    setEnd(0)
    setProgress(0)
    setDimensions(null)
    durationReadyRef.current = false
    if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  // Fermeture : on coupe tout et on nettoie l'objectURL.
  useEffect(() => {
    if (!open) resetAll()
  }, [open])

  // Nettoyage final au démontage.
  useEffect(() => {
    return () => {
      if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current)
    }
  }, [])

  const initRange = (d: number) => {
    setDuration(d)
    const e = Math.min(d, 12)
    setStart(0)
    setEnd(e)
    setPhase('ready')
  }

  const handleFile = (f: File | null) => {
    if (!f) return
    setError(null)
    const looksVideo = f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(f.name)
    if (!looksVideo) {
      setError('Ce fichier n\u2019est pas une vidéo. Choisissez un fichier MP4, WebM ou MOV.')
      return
    }
    stopPreview()
    durationReadyRef.current = false
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current)
    const url = URL.createObjectURL(f)
    objUrlRef.current = url
    setFile(f)
    setSrcUrl(url)
    setDuration(0)
    setDimensions(null)
    setPhase('loading')
  }

  const onLoadedMetadata = (v: HTMLVideoElement) => {
    setDimensions({ w: v.videoWidth, h: v.videoHeight })
    // Hack vidéos iPhone (.mov) : durée « Infinity » tant qu'on n'a pas
    // sauté à la fin — on force la lecture de la durée réelle.
    if (!isFinite(v.duration) || v.duration <= 0) {
      v.currentTime = 1e9
      return
    }
    if (!durationReadyRef.current) {
      durationReadyRef.current = true
      initRange(v.duration)
    }
  }

  const onDurationChange = (v: HTMLVideoElement) => {
    if (durationReadyRef.current) return
    if (isFinite(v.duration) && v.duration > 0) {
      durationReadyRef.current = true
      v.currentTime = 0
      initRange(v.duration)
    }
  }

  const onVideoError = () => {
    if (phaseRef.current !== 'loading') return
    setPhase('empty')
    setError('Impossible de lire cette vidéo dans votre navigateur. Astuce : envoyez-la à vous-même sur WhatsApp puis ajoutez le fichier reçu — il sera automatiquement converti en MP4 lisible.')
  }

  /** Sélection [début, fin] avec contraintes : 1 s min, 30 s max. */
  const handleRange = (vals: number[]) => {
    if (vals.length < 2) return
    stopPreview()
    const prevS = startRef.current
    const prevE = endRef.current
    let [s, e] = [vals[0], vals[1]]
    if (e < s) [s, e] = [e, s]
    const sMoved = Math.abs(s - prevS) > 0.05
    if (e - s > MAX_CLIP_SECONDS) {
      if (sMoved) e = Math.min(duration, s + MAX_CLIP_SECONDS)
      else s = Math.max(0, e - MAX_CLIP_SECONDS)
    }
    if (e - s < MIN_CLIP_SECONDS) {
      if (sMoved) e = Math.min(duration, s + MIN_CLIP_SECONDS)
      else s = Math.max(0, e - MIN_CLIP_SECONDS)
    }
    s = Math.max(0, Math.min(s, Math.max(0, duration - MIN_CLIP_SECONDS)))
    e = Math.max(MIN_CLIP_SECONDS, Math.min(e, duration))
    setStart(s)
    setEnd(e)
    // Retour visuel : afficher l'image à la poignée déplacée.
    const v = videoRef.current
    if (v) { v.currentTime = sMoved ? s : e }
  }

  const applyPreset = (length: number) => {
    stopPreview()
    const s = startRef.current
    const e = Math.min(duration, s + length)
    setStart(Math.max(0, Math.min(s, Math.max(0, duration - MIN_CLIP_SECONDS))))
    setEnd(Math.max(MIN_CLIP_SECONDS, e))
    const v = videoRef.current
    if (v) v.currentTime = s
  }

  const togglePreview = () => {
    const v = videoRef.current
    if (!v || phase !== 'ready') return
    if (previewRef.current) {
      stopPreview()
    } else {
      previewRef.current = true
      setPreviewing(true)
      v.currentTime = startRef.current
      v.play().catch(() => { stopPreview() })
    }
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !previewRef.current) return
    if (v.currentTime >= endRef.current - 0.05) v.currentTime = startRef.current
    else if (v.currentTime < startRef.current - 0.5) v.currentTime = startRef.current
  }

  const uploadDataUrl = async (dataUrl: string, clipSeconds: number) => {
    // L'icône d'accueil reste sur la vidéo le temps de la voir : durée du
    // clip + marge, bornée entre 8 et 30 s (champ `interval` existant).
    const intervalMs = Math.round(Math.min(30000, Math.max(8000, clipSeconds * 1000 + 1500)))
    const res = await fetch('/api/slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, type: 'video', interval: intervalMs })
    })
    if (!aliveRef.current) return
    if (res.ok) {
      const slide = await res.json()
      onAdded(slide)
      const sent = Math.round(dataUrl.length * 3 / 4)
      onSuccess('Succès', `Vidéo ajoutée au slider (${fmtSize(sent)} envoyés)`)
      onClose()
    } else {
      const data = await res.json().catch(() => ({}))
      setPhase('ready')
      onError('Erreur', (data as { error?: string })?.error || 'Impossible d\u2019ajouter la vidéo')
    }
  }

  /** Ajout direct, sans découpe ni ré-encodage (fichier déjà ≤ 9 Mo). */
  const addWholeFile = async () => {
    if (!file || phase !== 'ready') return
    stopPreview()
    setError(null)
    setPhase('uploading')
    try {
      const dataUrl = await readAsDataURL(file)
      if (!aliveRef.current) return
      await uploadDataUrl(dataUrl, duration > 0 ? duration : 8)
    } catch {
      if (!aliveRef.current) return
      setPhase('ready')
      onError('Erreur', 'Lecture du fichier impossible')
    }
  }

  /** Découpe + ré-encodage de l'extrait sélectionné, en direct dans le navigateur. */
  const cutAndAdd = async () => {
    const v = videoRef.current
    if (!v || phase !== 'ready' || duration <= 0) return
    stopPreview()
    setError(null)

    // Préférence MP4 (lisible partout, iPhone comprise), WebM en secours.
    const mimeCandidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm'
    ]
    const supported = typeof MediaRecorder !== 'undefined'
      ? mimeCandidates.find((t) => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } })
      : undefined
    if (!supported) {
      setError('Votre navigateur ne sait pas découper les vidéos. Utilisez Chrome, ou envoyez la vidéo à vous-même sur WhatsApp et ajoutez le fichier reçu (≤ 9 Mo).')
      return
    }

    const vw = v.videoWidth
    const vh = v.videoHeight
    if (!vw || !vh) {
      setError('Vidéo illisible — dimensions inconnues.')
      return
    }

    const canvas = document.createElement('canvas')
    const MAX_SIDE = 1280
    let w = vw
    let h = vh
    if (Math.max(vw, vh) > MAX_SIDE) {
      if (vw >= vh) { w = MAX_SIDE; h = Math.max(2, Math.round((vh * MAX_SIDE) / vw / 2) * 2) }
      else { h = MAX_SIDE; w = Math.max(2, Math.round((vw * MAX_SIDE) / vh / 2) * 2) }
    } else {
      w = Math.max(2, Math.round(vw / 2) * 2)
      h = Math.max(2, Math.round(vh / 2) * 2)
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Découpe impossible dans ce navigateur.')
      return
    }

    const secs = Math.max(0.5, end - start)
    // Débit adaptatif : l'extrait reste léger quelle que soit la durée choisie.
    const bitrate = Math.min(2_000_000, Math.floor((8.5 * 1024 * 1024 * 8) / secs))

    let rec: MediaRecorder
    try {
      const stream = canvas.captureStream(30)
      rec = new MediaRecorder(stream, { mimeType: supported, videoBitsPerSecond: bitrate })
    } catch {
      setError('Découpe impossible dans ce navigateur.')
      return
    }

    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }

    setPhase('exporting')
    setProgress(0)

    let watchdog: ReturnType<typeof setInterval> | null = null
    let safetyTimer: ReturnType<typeof setInterval> | null = null
    let rvfcId: number | null = null
    let finished = false
    let stalledTicks = 0

    const cleanupTimers = () => {
      if (watchdog) { clearInterval(watchdog); watchdog = null }
      if (safetyTimer) { clearInterval(safetyTimer); safetyTimer = null }
      if (rvfcId !== null) {
        const fv = videoRef.current as FrameCallbackVideo | null
        const cancel = (fv as FrameCallbackVideo & { cancelVideoFrameCallback?: (id: number) => void } | null)?.cancelVideoFrameCallback
        if (cancel) { try { cancel(rvfcId) } catch { /* noop */ } }
        rvfcId = null
      }
    }

    const finish = () => {
      if (finished) return
      finished = true
      cleanupTimers()
      try { ctx.drawImage(v, 0, 0, w, h) } catch { /* dernière image au mieux */ }
      v.pause()
      try { rec.stop() } catch { /* déjà arrêté */ }
    }

    try {
      v.muted = true
      v.playbackRate = 1
      await seekTo(v, start)

      const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve() })

      const draw = () => { try { ctx.drawImage(v, 0, 0, w, h) } catch { /* frame perdu */ } }
      const updateProgress = () => {
        const p = Math.min(1, Math.max(0, (v.currentTime - start) / secs))
        if (aliveRef.current) setProgress(p)
      }
      const atEnd = () => v.currentTime >= end - 0.05 || v.ended

      // Filet de sécurité : dessin à 30 i/s même sans requestVideoFrameCallback.
      safetyTimer = setInterval(draw, Math.round(1000 / 30))
      // Chien de garde : progression, détection de fin et de blocage.
      watchdog = setInterval(() => {
        if (finished) return
        updateProgress()
        if (atEnd()) { finish(); return }
        stalledTicks += 1
        if (stalledTicks > 220) finish() // ~33 s sans avancer → on sauve ce qu'on a
      }, 150)

      const fv = v as FrameCallbackVideo
      if (typeof fv.requestVideoFrameCallback === 'function') {
        const tick = () => {
          if (finished) return
          draw()
          updateProgress()
          if (atEnd()) { finish(); return }
          rvfcId = fv.requestVideoFrameCallback!(tick)
        }
        rvfcId = fv.requestVideoFrameCallback(tick)
      }

      rec.start(200)
      await v.play()

      await stopped
      cleanupTimers()
      v.pause()
      if (!aliveRef.current) return

      const blob = new Blob(chunks, { type: supported.split(';')[0] })
      if (blob.size === 0) throw new Error('empty')
      if (blob.size > EXPORT_MAX_BYTES) {
        setPhase('ready')
        setError(`L\u2019extrait fait ${fmtSize(blob.size)} — réduisez la durée (30 s maximum).`)
        return
      }

      setPhase('uploading')
      const dataUrl = await readAsDataURL(blob)
      if (!aliveRef.current) return
      await uploadDataUrl(dataUrl, secs)
    } catch {
      cleanupTimers()
      v.pause()
      if (!aliveRef.current) return
      setPhase('ready')
      setError('La découpe a échoué — réessayez en gardant cet onglet bien visible.')
    }
  }

  const busy = phase === 'exporting' || phase === 'uploading'
  const selLength = Math.max(0, end - start)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); else if (!o && !aliveRef.current) onClose() }}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white border-[#E5E0DA]">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Découpeuse vidéo
          </DialogTitle>
          <DialogDescription className="text-xs text-[#6B6560]">
            Ajoutez une vidéo au Hero Slider. Aucune limite de taille : la vidéo reste sur votre appareil, seul l&rsquo;extrait choisi est envoyé, déjà optimisé.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded" role="alert">
            {error}
          </div>
        )}

        {phase === 'empty' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video bg-[#EDE8E1] border-2 border-dashed border-[#6B6560] rounded flex flex-col items-center justify-center gap-2 hover:border-[#9C7C5C] transition-colors"
            >
              <Film className="w-7 h-7 text-[#6B6560]" aria-hidden="true" />
              <span className="text-sm text-[#0A0A0A] font-medium">Choisir une vidéo</span>
              <span className="text-[11px] text-[#9C9A92] px-6 text-center">MP4, WebM ou MOV — même plusieurs dizaines de Mo</span>
            </button>
            <p className="text-[11px] text-[#9C9A92] text-center">
              Vous découperez ensuite le passage à garder (30 s maximum conseillé).
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              aria-label="Fichier vidéo"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                handleFile(f)
                e.target.value = ''
              }}
            />
          </div>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <RefreshCw className="w-6 h-6 text-[#9C7C5C] animate-spin" aria-hidden="true" />
            <p className="text-sm text-[#6B6560]">Lecture de la vidéo…</p>
            <video
              ref={videoRef}
              src={srcUrl ?? undefined}
              className="hidden"
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget)}
              onDurationChange={(e) => onDurationChange(e.currentTarget)}
              onError={onVideoError}
            />
          </div>
        )}

        {(phase === 'ready' || phase === 'exporting' || phase === 'uploading') && srcUrl && (
          <div className="flex flex-col gap-4">
            <div className="relative bg-black rounded overflow-hidden">
              <video
                ref={videoRef}
                src={srcUrl}
                className="w-full max-h-56 object-contain"
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget)}
                onDurationChange={(e) => onDurationChange(e.currentTarget)}
                onError={onVideoError}
                onTimeUpdate={onTimeUpdate}
              />
              {file && (
                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded flex gap-2">
                  <span>{fmtSize(file.size)}</span>
                  {dimensions && <span>{dimensions.w}×{dimensions.h}</span>}
                  <span>{fmtTime(duration)}</span>
                </div>
              )}
            </div>

            {phase === 'ready' && (
              <>
                <div>
                  <div className="flex justify-between text-[11px] text-[#6B6560] mb-2">
                    <span>Début <strong className="text-[#0A0A0A]">{fmtTime(start)}</strong></span>
                    <span>Fin <strong className="text-[#0A0A0A]">{fmtTime(end)}</strong></span>
                  </div>
                  <Slider
                    value={[start, end]}
                    min={0}
                    max={Math.max(MIN_CLIP_SECONDS, duration)}
                    step={0.1}
                    minStepsBetweenThumbs={Math.round(MIN_CLIP_SECONDS / 0.1)}
                    onValueChange={handleRange}
                    aria-label="Sélection de l'extrait"
                    className="py-2"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-[#6B6560]">
                      Extrait : <strong className="text-[#9C7C5C]">{selLength.toFixed(1)} s</strong>
                    </span>
                    <div className="flex gap-1">
                      {[8, 15, 30].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className="text-[11px] px-2 py-1 border border-[#E5E0DA] rounded text-[#6B6560] hover:border-[#9C7C5C] hover:text-[#9C7C5C] transition-colors"
                        >
                          {p} s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={togglePreview}
                    className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E0DA] rounded text-xs text-[#0A0A0A] hover:border-[#9C7C5C] transition-colors"
                  >
                    {previewing ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
                    {previewing ? 'Arrêter l\u2019aperçu' : 'Aperçu de l\u2019extrait'}
                  </button>
                  <button
                    type="button"
                    onClick={cutAndAdd}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 bg-[#9C7C5C] hover:bg-[#8a6b4e] text-white rounded text-xs font-medium uppercase tracking-wider transition-colors"
                  >
                    <Scissors className="w-4 h-4" aria-hidden="true" />
                    Découper et ajouter ({selLength.toFixed(0)} s)
                  </button>
                </div>

                {file && file.size <= DIRECT_MAX_BYTES && (
                  <button
                    type="button"
                    onClick={addWholeFile}
                    className="flex items-center justify-center gap-1.5 w-full px-4 py-2 border border-[#E5E0DA] rounded text-xs text-[#6B6560] hover:border-[#9C7C5C] hover:text-[#9C7C5C] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Ajouter la vidéo entière, sans découpe ({fmtSize(file.size)})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { if (!busy) { handleFile(null); resetAll() } }}
                  className="text-[11px] text-[#9C9A92] hover:text-[#6B6560] underline underline-offset-2 self-center"
                >
                  Choisir une autre vidéo
                </button>
              </>
            )}

            {phase === 'exporting' && (
              <div className="flex flex-col gap-2 py-2" role="status" aria-live="polite">
                <div className="flex justify-between text-xs text-[#6B6560]">
                  <span>Découpe en cours…</span>
                  <span>{Math.round(progress * 100)} %</span>
                </div>
                <Progress value={Math.round(progress * 100)} />
                <p className="text-[11px] text-[#9C9A92]">
                  Gardez cet onglet ouvert et visible jusqu&rsquo;à la fin — l&rsquo;extrait est préparé en direct sur votre appareil.
                </p>
              </div>
            )}

            {phase === 'uploading' && (
              <div className="flex flex-col items-center gap-2 py-3" role="status" aria-live="polite">
                <RefreshCw className="w-5 h-5 text-[#9C7C5C] animate-spin" aria-hidden="true" />
                <p className="text-xs text-[#6B6560]">Envoi de l&rsquo;extrait optimisé…</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
