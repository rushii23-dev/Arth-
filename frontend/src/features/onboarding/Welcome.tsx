import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Icon, useOverlayHost } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk, useFarmer } from '@/lib/api/queries'
import { useLang } from '@/i18n'

/**
 * The moment after a new farmer finishes onboarding: "Welcome to Arth, <name>" while the first
 * brief loads behind it. It stays about two seconds, longer if the brief is still on its way
 * (never more than seven), then fades into Home. Drawn on the frame's overlay layer, above the
 * nav and the mic, inside the safe areas; static under prefers-reduced-motion.
 */

const MIN_MS = 2_000
const MAX_MS = 7_000
const EXIT_MS = 380
/** the three lines tick one after another while the brief loads */
const STEP_MS = [450, 900, 1_350]

export function Welcome({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('onboarding')
  const { lang } = useLang()
  const { host, framed } = useOverlayHost()
  const name = useFarmer().data?.name?.trim().split(/\s+/)[0] ?? ''
  // the same query Home runs, so Home opens on a brief that is already here
  const brief = useQuery({ queryKey: qk.brief(lang), queryFn: () => api.getBrief(lang) })
  const settled = !brief.isPending

  const [minDone, setMinDone] = useState(false)
  const [maxDone, setMaxDone] = useState(false)
  const [ticks, setTicks] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const ids = [
      window.setTimeout(() => setMinDone(true), MIN_MS),
      window.setTimeout(() => setMaxDone(true), MAX_MS),
      ...STEP_MS.map((ms, i) => window.setTimeout(() => setTicks((n) => Math.max(n, i + 1)), ms)),
    ]
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [])

  const ready = (minDone && settled) || maxDone
  if (ready && !leaving) setLeaving(true)

  useEffect(() => {
    if (!leaving) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const id = window.setTimeout(onDone, still ? 0 : EXIT_MS)
    return () => window.clearTimeout(id)
  }, [leaving, onDone])

  if (!host) return null
  const steps = t('welcomeMoment.steps', { returnObjects: true }) as string[]
  const lines = Array.isArray(steps) ? steps : []
  const done = leaving ? lines.length : ticks

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`${framed ? 'absolute' : 'fixed'} inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-screen px-8 pb-[calc(24px+var(--sab))] pt-[calc(24px+var(--sat))] text-center ${leaving ? 'welcome-out' : ''}`}
    >
      {/* soft morning light behind the mark */}
      <span aria-hidden className="welcome-glow pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      {/* furrows at the foot of the screen, like the login dawn */}
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] w-full" viewBox="0 0 400 150" preserveAspectRatio="none">
        <path d="M0 150 L0 92 Q200 52 400 92 L400 150 Z" fill="#E6EFE4" />
        <path d="M0 150 L0 118 Q200 84 400 118 L400 150 Z" fill="#D6E5D3" />
        <g fill="none" stroke="#2E6B3F" strokeOpacity=".12" strokeWidth="2">
          <path d="M-10 132 Q200 100 410 132" />
          <path d="M-10 144 Q200 116 410 144" />
        </g>
      </svg>

      <WelcomeMark />

      <h1 className="display welcome-up-1 relative mt-7 text-[32px] leading-[1.15] text-ink">
        {name ? t('welcomeMoment.title', { name }) : t('welcomeMoment.titleNoName')}
      </h1>
      <p className="welcome-up-2 relative mt-2 text-[17px] text-muted">{t('welcomeMoment.sub')}</p>

      <ul className="welcome-up-3 relative mt-7 w-full max-w-[280px] space-y-2.5 text-left">
        {lines.map((line, i) => {
          const on = i < done
          return (
            <li key={i} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors duration-300 ${on ? 'bg-grow text-white' : 'bg-card text-hint'}`}
              >
                {on ? <Icon name="check" size={15} strokeWidth={3} className="welcome-tick" /> : <span className="h-1.5 w-1.5 rounded-full bg-hint" />}
              </span>
              <span className={`text-[16px] leading-snug transition-colors duration-300 ${on ? 'font-semibold text-ink' : 'text-faint'}`}>{line}</span>
            </li>
          )
        })}
      </ul>

      <div aria-hidden className="welcome-up-3 relative mt-8 h-1.5 w-[180px] overflow-hidden rounded-full bg-card">
        <span className={`welcome-bar block h-full rounded-full bg-[#E8B04B] ${leaving ? 'welcome-bar-done' : ''}`} />
      </div>
    </div>,
    host,
  )
}

/** Arth's mark (public/logo.svg), drawn inline so the sun can rise and the sprout grow. */
function WelcomeMark() {
  return (
    <svg viewBox="0 0 512 512" className="welcome-mark relative h-[112px] w-[112px] drop-shadow-[0_18px_30px_rgba(36,82,49,.28)]" aria-hidden>
      <rect width="512" height="512" rx="116" fill="#2E6B3F" />
      <g className="welcome-sun">
        <circle cx="256" cy="228" r="124" fill="#E8B04B" />
        <circle cx="256" cy="228" r="104" fill="none" stroke="#C98F2E" strokeWidth="6" strokeDasharray="2 14" strokeLinecap="round" />
      </g>
      <g fill="none" stroke="#E9E5DA" strokeLinecap="round">
        <path d="M92 382 Q256 330 420 382" strokeWidth="22" />
        <path d="M120 428 Q256 388 392 428" strokeWidth="18" opacity=".8" />
        <path d="M156 466 Q256 438 356 466" strokeWidth="14" opacity=".6" />
      </g>
      <g className="welcome-sprout">
        <path d="M256 356 V196" stroke="#1F4A2B" strokeWidth="16" strokeLinecap="round" />
        <path d="M256 268 C232 214 190 196 150 204 C160 252 204 282 256 268 Z" fill="#245231" />
        <path d="M256 224 C276 160 322 136 370 142 C362 200 314 236 256 224 Z" fill="#5C9A62" />
      </g>
    </svg>
  )
}
