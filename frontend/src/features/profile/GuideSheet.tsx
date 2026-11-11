import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Button, Icon, KCC_NUMBER, type IconName } from '@/components/ui'
import { KCC_TEL } from './profileData'

/**
 * "How to use Arth": a short tour of the main screens, one per page. Each page shows a small
 * picture of the phone with the button to tap lit up, what the screen is for, and three steps.
 * Next / Back (or a swipe) move through it; "Open …" goes straight to that screen. The last page
 * answers the common questions and offers the Kisan Call Centre.
 */

type Target = 'home' | 'mic' | 'doctor' | 'mandi' | 'calendar' | 'tools' | 'profile'
interface Screen {
  key: Target
  t: string
  b: string
  how: string[]
}

/** Where each page's "Open" button goes (the mic is on every screen, so it has none). */
const PATH: Partial<Record<Target, string>> = { home: '/', doctor: '/doctor', mandi: '/mandi', calendar: '/calendar', tools: '/', profile: '/profile' }
const NAV_TABS: { key: Target; icon: IconName }[] = [
  { key: 'home', icon: 'home' },
  { key: 'doctor', icon: 'doctor' },
  { key: 'mandi', icon: 'mandi' },
  { key: 'calendar', icon: 'calendar' },
  { key: 'profile', icon: 'profile' },
]
const TINT: Record<Target, string> = {
  home: 'from-grow-l',
  mic: 'from-grow-l',
  doctor: 'from-grow-l',
  mandi: 'from-amber-l',
  calendar: 'from-grow-l',
  tools: 'from-amber-l',
  profile: 'from-chip',
}
const SWIPE_PX = 56

export function GuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('profile')
  const nav = useNavigate()
  const raw = t('guide.screens', { returnObjects: true }) as Screen[]
  const screens = Array.isArray(raw) ? raw : []
  const last = screens.length // the "you're ready" page
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [wasOpen, setWasOpen] = useState(open)

  // every time the guide opens, it starts from the first page
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPage(0)
  }

  function go(to: number) {
    const next = Math.max(0, Math.min(last, to))
    if (next === page) return
    setDir(next > page ? 1 : -1)
    setPage(next)
  }

  // arrow keys move through the pages while the guide is open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(page + 1)
      else if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function openScreen(path: string) {
    onClose()
    nav(path)
  }

  // horizontal swipe between pages (vertical scrolling stays the browser's)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: ReactPointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(page + (dx < 0 ? 1 : -1))
  }

  const screen = page < last ? screens[page] : undefined
  const footer = (
    <div>
      <Progress page={page} total={last + 1} onPick={go} />
      <div className="mt-3 flex gap-2.5">
        {page > 0 ? (
          <button
            type="button"
            onClick={() => go(page - 1)}
            aria-label={t('guide.back')}
            className="flex h-[62px] w-[62px] flex-none items-center justify-center rounded-[34px] bg-card text-ink active:bg-chip"
          >
            <Icon name="back" size={22} />
          </button>
        ) : null}
        {page < last ? (
          <Button onClick={() => go(page + 1)} className="flex-1">
            <span className="inline-flex items-center gap-1.5">
              {t('guide.next')}
              <Icon name="chevron" size={18} />
            </span>
          </Button>
        ) : (
          <Button icon="check" onClick={onClose} className="flex-1">
            {t('guide.done')}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <BottomSheet open={open} onClose={onClose} title={t('guide.title')} footer={footer}>
      <div
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => {
          swipe.current = null
        }}
        className="touch-pan-y"
      >
        <Slide key={page} dir={dir}>
          {screen ? <StepPage screen={screen} n={page + 1} total={last} onOpen={PATH[screen.key] ? () => openScreen(PATH[screen.key]!) : undefined} /> : <ReadyPage />}
        </Slide>
      </div>
    </BottomSheet>
  )
}

/** Slides each page in from the side it came from; nothing moves under reduced motion. */
function Slide({ dir, children }: { dir: 1 | -1; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // the sheet body scrolls: each page starts at its top
    const body = el.closest('.overflow-y-auto')
    if (body) body.scrollTop = 0
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !el.animate) return
    el.animate(
      [
        { opacity: 0, transform: `translateX(${dir * 36}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 300, easing: 'cubic-bezier(.22,.8,.2,1)' },
    )
  }, [dir])
  return <div ref={ref}>{children}</div>
}

function Progress({ page, total, onPick }: { page: number; total: number; onPick: (i: number) => void }) {
  const { t } = useTranslation('profile')
  return (
    <div role="group" aria-label={t('guide.stepsLabel')} className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(i)}
          aria-label={t('guide.stepOf', { n: i + 1, total })}
          aria-current={i === page ? 'step' : undefined}
          className="group flex h-6 flex-1 items-center"
        >
          <span className={`block h-1.5 w-full rounded-full transition-colors duration-300 ${i < page ? 'bg-grow/45' : i === page ? 'bg-grow' : 'bg-track'}`} />
        </button>
      ))}
    </div>
  )
}

function StepPage({ screen, n, total, onOpen }: { screen: Screen; n: number; total: number; onOpen?: () => void }) {
  const { t } = useTranslation('profile')
  const { t: tn } = useTranslation('nav')
  const how = Array.isArray(screen.how) ? screen.how : []
  const screenName = screen.key === 'tools' ? tn('home') : tn(screen.key)
  return (
    <div>
      <div className={`overflow-hidden rounded-[28px] bg-linear-to-b ${TINT[screen.key]} to-card px-4 pt-4`}>
        <PhoneSketch target={screen.key} />
      </div>

      <div className="mt-3 px-1">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="num text-[13px] font-semibold uppercase tracking-[1.4px] text-grow">{t('guide.stepOf', { n, total })}</span>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-2xl px-3 text-[14.5px] font-semibold text-grow active:bg-grow-l"
            >
              {t('guide.open', { screen: screenName })}
              <Icon name="chevron" size={16} />
            </button>
          ) : null}
        </div>
        <h3 className="display text-[26px] leading-[1.15] text-ink">{screen.t}</h3>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{screen.b}</p>
      </div>

      <ol className="mt-3.5 space-y-2">
        {how.map((step, i) => (
          <li key={i} className="flex items-start gap-3 rounded-[20px] bg-card px-3.5 py-2.5">
            <span className="num flex h-7 w-7 flex-none items-center justify-center rounded-full bg-grow-l text-[13px] font-bold text-grow-d">{i + 1}</span>
            <span className="pt-0.5 text-[15.5px] leading-snug text-ink">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ReadyPage() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('profile', { keyPrefix: 'help' })
  const faq = t('guide.faq', { returnObjects: true }) as { q: string; a: string }[]
  return (
    <div>
      <div className="flex flex-col items-center rounded-[28px] bg-linear-to-b from-grow-l to-card px-5 pb-5 pt-6 text-center">
        <img src="/logo.svg" alt="" className="h-16 w-16 drop-shadow-[0_10px_18px_rgba(36,82,49,.25)]" />
        <h3 className="display mt-3 text-[26px] leading-tight text-ink">{t('guide.readyTitle')}</h3>
        <p className="mt-1.5 text-[15.5px] leading-snug text-ink-2">{t('guide.readyBody')}</p>
        <a href={KCC_TEL} className="mt-4 inline-flex h-12 items-center gap-2 rounded-[24px] bg-ink px-5 text-[15.5px] font-semibold text-white active:brightness-110">
          <Icon name="phone" size={18} />
          {tc('call', { n: KCC_NUMBER })}
        </a>
      </div>

      <h3 className="display mx-1 mb-2 mt-5 text-[20px] text-ink">{t('guide.faqTitle')}</h3>
      <div className="divide-y divide-hair overflow-hidden rounded-[22px] bg-card">
        {(Array.isArray(faq) ? faq : []).map((x, i) => (
          <details key={i} className="group px-4">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 py-2 text-[15.5px] font-semibold leading-snug text-ink [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">{x.q}</span>
              <Icon name="chevron" size={16} className="flex-none text-hint transition group-open:rotate-90" />
            </summary>
            <p className="pb-4 text-[14.5px] leading-snug text-muted">{x.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

// ---- The phone sketch ----------------------------------------------------------

/**
 * A small drawing of Arth on a phone: a hint of the screen above, the bottom bar and the mic,
 * with the thing to tap lit up and pulsing.
 */
function PhoneSketch({ target }: { target: Target }) {
  const { t } = useTranslation('profile')
  const navTarget = target === 'tools' ? 'home' : target
  return (
    <div aria-hidden className="relative mx-auto h-[162px] w-[232px] overflow-hidden rounded-t-[30px] border-[6px] border-b-0 border-ink bg-screen shadow-[0_-6px_24px_-10px_rgba(23,21,15,.35)]">
      <div className="mx-auto mt-1.5 h-1 w-10 rounded-full bg-ink/80" />
      <div className="px-3 pt-2">
        <SketchScreen target={target} />
      </div>

      {/* the mic, floating above the bar (left out where it would cover the tools) */}
      {target === 'tools' ? null : (
      <span className={`absolute bottom-[48px] right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-white ${target === 'mic' ? 'bg-grow' : 'bg-grow/70'}`}>
        <Icon name="mic" size={15} strokeWidth={2.4} />
        {target === 'mic' ? <Ping /> : null}
      </span>
      )}

      {/* the bottom bar */}
      <div className="absolute inset-x-0 bottom-0 grid h-[42px] grid-cols-5 border-t border-hair bg-card">
        {NAV_TABS.map((tab) => {
          const on = tab.key === navTarget && target !== 'mic'
          return (
            <span key={tab.key} className={`relative flex flex-col items-center justify-center ${on ? 'text-grow-d' : 'text-ghost'}`}>
              {on ? <span className="absolute top-0 h-[3px] w-6 rounded-b-full bg-grow" /> : null}
              <span className={`relative flex h-7 w-9 items-center justify-center rounded-full ${on ? 'bg-grow-l' : ''}`}>
                <Icon name={tab.icon} size={16} strokeWidth={on ? 2.4 : 2} />
                {on && target !== 'tools' ? <Ping /> : null}
              </span>
            </span>
          )
        })}
      </div>

      {target !== 'tools' ? (
        <span className={`guide-hint absolute rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-white ${hintPos(target)}`}>{t('guide.tapHere')}</span>
      ) : null}
    </div>
  )
}

function hintPos(target: Target) {
  switch (target) {
    case 'mic':
      return 'bottom-[86px] right-1.5'
    case 'home':
      return 'bottom-[46px] left-1'
    case 'profile':
      return 'bottom-[46px] right-1'
    case 'doctor':
      return 'bottom-[46px] left-[30px]'
    case 'mandi':
      return 'bottom-[46px] left-1/2 -translate-x-1/2'
    default:
      return 'bottom-[46px] right-[26px]'
  }
}

/** A soft ring that pulses out from the thing to tap. */
function Ping() {
  return <span className="guide-ping pointer-events-none absolute inset-0 rounded-full ring-2 ring-grow" />
}

/** The top of the screen, enough to recognise which one it is. */
function SketchScreen({ target }: { target: Target }) {
  const line = (w: string, tone = 'bg-track') => <span className={`block h-1.5 rounded-full ${tone} ${w}`} />
  switch (target) {
    case 'home':
      return (
        <div className="space-y-1.5">
          {line('w-14', 'bg-ghost/60')}
          <div className="rounded-xl bg-grow px-2.5 py-2">
            <span className="block h-1.5 w-16 rounded-full bg-white/60" />
            <span className="mt-1.5 block h-2 w-28 rounded-full bg-white" />
            <span className="mt-1 block h-1.5 w-20 rounded-full bg-white/70" />
          </div>
          <div className="flex gap-1.5">
            <span className="h-6 flex-1 rounded-lg bg-card" />
            <span className="h-6 flex-1 rounded-lg bg-card" />
          </div>
        </div>
      )
    case 'mic':
      return (
        <div className="space-y-1.5">
          {line('w-16', 'bg-ghost/60')}
          <div className="ml-auto w-fit max-w-[150px] rounded-xl rounded-br-sm bg-card px-2.5 py-1.5 text-[10px] font-semibold leading-tight text-ink-2">“…?”</div>
          <div className="w-fit rounded-xl rounded-bl-sm bg-grow-l px-2.5 py-1.5">
            {line('w-24', 'bg-grow/40')}
            <span className="mt-1 block h-1.5 w-16 rounded-full bg-grow/30" />
          </div>
        </div>
      )
    case 'doctor':
      return (
        <div className="flex items-center gap-2.5">
          <span className="flex h-[62px] w-[62px] flex-none items-center justify-center rounded-xl border-2 border-dashed border-grow/50 bg-card text-grow">
            <Icon name="camera" size={22} />
          </span>
          <div className="flex-1 space-y-1.5">
            {line('w-full', 'bg-grow/40')}
            {line('w-3/4')}
            {line('w-1/2')}
          </div>
        </div>
      )
    case 'mandi':
      return (
        <div>
          <div className="flex h-[52px] items-end gap-1.5 rounded-xl bg-card px-2.5 pb-1.5">
            {[40, 58, 46, 70, 64, 88].map((h, i) => (
              <span key={i} className={`flex-1 rounded-t-sm ${i === 5 ? 'bg-amber' : 'bg-amber/35'}`} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between rounded-lg bg-card px-2 py-1">
            {line('w-14')}
            <span className="num text-[10px] font-bold text-ink">₹</span>
          </div>
        </div>
      )
    case 'calendar':
      return (
        <div className="space-y-1.5">
          <div className="flex h-3 overflow-hidden rounded-full">
            <span className="w-[38%] bg-grow" />
            <span className="w-[34%] bg-amber" />
            <span className="w-[28%] bg-warn/60" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5">
              <span className="h-4 w-4 rounded-md bg-grow-l" />
              {line(i ? 'w-16' : 'w-24')}
            </div>
          ))}
        </div>
      )
    case 'tools': {
      const tiles: { icon: IconName; on: boolean }[] = [
        { icon: 'doctor', on: false },
        { icon: 'mandi', on: false },
        { icon: 'calendar', on: false },
        { icon: 'label', on: true },
        { icon: 'schemes', on: true },
        { icon: 'kagaz', on: true },
      ]
      return (
        <div className="grid grid-cols-3 gap-1.5">
          {tiles.map((x, i) => (
            <span key={i} className={`relative flex h-[38px] items-center justify-center rounded-lg ${x.on ? 'bg-card text-grow-d ring-2 ring-grow/70' : 'bg-card/70 text-ghost'}`}>
              <Icon name={x.icon} size={16} />
              {x.on && i === 3 ? <Ping /> : null}
            </span>
          ))}
        </div>
      )
    }
    case 'profile':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-xl bg-card px-2 py-1.5">
            <span className="h-6 w-6 rounded-lg bg-grow" />
            <div className="space-y-1">
              {line('w-16')}
              {line('w-10')}
            </div>
          </div>
          {(['globe', 'settings'] as const).map((ic) => (
            <div key={ic} className="flex items-center gap-2 rounded-lg bg-card px-2 py-1 text-ghost">
              {ic === 'globe' ? <Icon name="globe" size={12} /> : <span className="h-3 w-3 rounded bg-track" />}
              {line('w-20')}
            </div>
          ))}
        </div>
      )
  }
}
