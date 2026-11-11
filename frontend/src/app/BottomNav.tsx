import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '@/components/ui'

/**
 * A full-width bar of five tabs at the bottom of the screen (styles: `.arth-nav*` in index.css).
 * Every tab keeps its icon and a short label (many of our farmers read little, so icons alone are
 * not enough). The active tab gets a line that slides along the top edge, a soft green bloom behind
 * its icon and a small pop as the icon settles. The voice button floats just above the bar (MicSlot).
 */

const TABS: { key: string; path: string; icon: IconName }[] = [
  { key: 'home', path: '/', icon: 'home' },
  { key: 'doctor', path: '/doctor', icon: 'doctor' },
  { key: 'mandi', path: '/mandi', icon: 'mandi' },
  { key: 'calendar', path: '/calendar', icon: 'calendar' },
  { key: 'profile', path: '/profile', icon: 'profile' },
]

export const NAV_PATHS = TABS.map((t) => t.path)

/** The short label under each tab: `nav.tab.*` when present, else the screen name. */
function useTabLabel() {
  const { t, i18n } = useTranslation('nav')
  return (key: string) => (i18n.exists(`nav:tab.${key}`) ? t(`tab.${key}`) : t(key))
}

export function BottomNav() {
  const { t } = useTranslation('nav')
  const label = useTabLabel()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const activeIndex = TABS.findIndex((tab) => (tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path)))

  return (
    <nav aria-label={t('main', { defaultValue: 'Main' })} className="arth-nav">
      <span
        aria-hidden
        className="arth-nav-line"
        style={{ transform: `translateX(${Math.max(0, activeIndex) * 100}%)`, opacity: activeIndex >= 0 ? 1 : 0 }}
      />
      {TABS.map((tab, i) => {
        const active = i === activeIndex
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => nav(tab.path)}
            aria-current={active ? 'page' : undefined}
            className="arth-nav-tab"
            data-active={active || undefined}
          >
            <span className="arth-nav-icon">
              <span aria-hidden className="arth-nav-bloom" />
              <Icon name={tab.icon} size={23} strokeWidth={active ? 2.4 : 2} />
            </span>
            <span className="arth-nav-label">{label(tab.key)}</span>
          </button>
        )
      })}
    </nav>
  )
}
