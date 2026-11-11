import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Icon } from './Icon'
import { useOverlayHost } from './OverlayLayer'

/** How long the close animation runs (matches .sheet-out / .scrim-out in index.css). */
const EXIT_MS = 220
/** Dragging the handle down this far closes the sheet. */
const DISMISS_PX = 96

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Modal bottom sheet, drawn on the app frame's overlay layer (above the bottom nav and the mic).
 * The title row stays put while the body scrolls; closes on backdrop tap, Escape, the close
 * button, or a swipe down on the handle and title. Focus moves in, and back out on close.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** pinned under the scrolling body (e.g. step buttons), clear of the gesture bar */
  footer?: ReactNode
}) {
  const { t } = useTranslation('common')
  const { host, framed } = useOverlayHost()
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // kept mounted while the close animation plays
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  const [drag, setDrag] = useState(0)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  // open → mount; close → play the exit, then unmount ("adjust state while rendering", no effect needed)
  if (open && (!shown || closing)) {
    setShown(true)
    setClosing(false)
  } else if (!open && shown && !closing) {
    if (reducedMotion()) setShown(false)
    else setClosing(true)
  }

  useEffect(() => {
    if (!closing) return
    const id = window.setTimeout(() => {
      setShown(false)
      setClosing(false)
      setDrag(0)
    }, EXIT_MS)
    return () => window.clearTimeout(id)
  }, [closing])

  useEffect(() => {
    if (!open || !host) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.({ preventScroll: true })
    }
  }, [open, host])

  if (!shown || !host) return null

  function down(e: ReactPointerEvent) {
    if (e.button !== 0) return
    setDragFrom(e.clientY)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function move(e: ReactPointerEvent) {
    if (dragFrom === null) return
    setDrag(Math.max(0, e.clientY - dragFrom))
  }
  function up() {
    if (dragFrom === null) return
    setDragFrom(null)
    if (drag > DISMISS_PX) onClose()
    else setDrag(0)
  }

  const dragging = dragFrom !== null
  return createPortal(
    <div className={`${framed ? 'absolute' : 'fixed'} inset-0 z-50 flex items-end justify-center`}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close')}
        onClick={onClose}
        className={`absolute inset-0 bg-ink/50 ${closing ? 'scrim-out' : 'scrim-in'}`}
        style={drag ? { opacity: Math.max(0.35, 1 - drag / 400) } : undefined}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[calc(100%-var(--sat)-36px)] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[32px] bg-screen shadow-[0_-12px_40px_-12px_rgba(23,21,15,.35)] outline-none ${closing ? 'sheet-out' : 'sheet-in'}`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: dragging ? 'none' : 'transform .2s ease' } : undefined}
      >
        {/* the handle and title: drag down to close; stays in place while the body scrolls */}
        <div className="flex-none touch-none select-none px-5 pt-2.5" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-track" />
          <div className="flex items-start justify-between gap-3 pb-3 pt-3">
            <h2 id={titleId} className="display min-w-0 pt-1 text-[24px] leading-tight text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t('close')}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-card text-ink active:bg-chip"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
        <div className={`sc min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${footer ? 'pb-4' : 'pb-[max(24px,calc(var(--sab)+16px))]'}`}>{children}</div>
        {footer ? <div className="flex-none border-t border-hair bg-screen px-5 pb-[max(16px,calc(var(--sab)+10px))] pt-3">{footer}</div> : null}
      </div>
    </div>,
    host,
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: ReactNode
  body: ReactNode
  confirmLabel: ReactNode
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <div className="text-[16px] leading-relaxed text-ink-2">{body}</div>
      <div className="mt-5 space-y-2.5">
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </BottomSheet>
  )
}
