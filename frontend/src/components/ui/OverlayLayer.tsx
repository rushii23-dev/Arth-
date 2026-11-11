import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Where sheets and full-screen moments are drawn: one layer on top of the app frame, above the
 * bottom nav, the mic and the status-bar strip.
 *
 * Sheets used to be `position: fixed` inside the scrolling screen. The screen's entry animation
 * (`.fade`, filled with a transform) makes it the containing block for fixed children, so a sheet
 * opened lower down a long page was drawn at the top of the scrolled content, off screen, and
 * under the nav. Portalling into this layer keeps them on the visible screen, inside the phone
 * bezel on a laptop, whatever the page under them does.
 */

const LayerContext = createContext<HTMLElement | null | undefined>(undefined)

export function OverlayLayer({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  return (
    <LayerContext.Provider value={el}>
      {children}
      <div ref={setEl} className="arth-layer" />
    </LayerContext.Provider>
  )
}

/**
 * The element to portal overlays into. Inside the app frame: its layer (null for the one render
 * before the layer mounts). Outside any frame: document.body.
 */
export function useOverlayHost(): { host: HTMLElement | null; framed: boolean } {
  const layer = useContext(LayerContext)
  if (layer === undefined) return { host: typeof document === 'undefined' ? null : document.body, framed: false }
  return { host: layer, framed: true }
}
