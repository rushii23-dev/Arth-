import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, ErrorState, Icon, PageHeader, SectionHead, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk, useIsAdmin } from '@/lib/api/queries'
import type { AdminCount, AdminFarmer, AdminOverview } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'

/**
 * The founder dashboard: who has joined, from where, growing what, and who has gone quiet.
 * Only for the verified Google emails in the backend's ARTH_ADMIN_EMAILS. Everyone else sees a
 * short "not for you" note, and the data is never even requested for them (the backend refuses
 * it anyway).
 */

const BARS = 8

export default function AdminPage() {
  const { t } = useTranslation('admin')
  const nav = useNavigate()
  const access = useQuery({ queryKey: qk.adminAccess, queryFn: api.getAdminAccess, staleTime: 30 * 60_000, retry: false })
  const admin = access.data?.admin === true

  if (access.isPending)
    return (
      <>
        <PageHeader title={t('title')} backTo="/profile" />
        <DashSkeleton />
      </>
    )
  if (!admin)
    return (
      <>
        <PageHeader title={t('title')} backTo="/profile" />
        <EmptyState
          icon="lock"
          title={t('denied')}
          body={t('deniedBody')}
          action={
            <Button variant="secondary" onClick={() => nav('/profile', { replace: true })}>
              {t('back')}
            </Button>
          }
        />
      </>
    )
  return <Dashboard />
}

function Dashboard() {
  const { t } = useTranslation('admin')
  const { lang } = useLang()
  const isAdmin = useIsAdmin()
  const q = useQuery({ queryKey: qk.adminOverview, queryFn: api.getAdminOverview, enabled: isAdmin, staleTime: 60_000, retry: false })
  const o = q.data

  return (
    <>
      <PageHeader title={t('title')} subtitle={o ? t('updated', { time: fmtDate(o.generatedAt, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }) : t('sub')} backTo="/profile" />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-card px-4 text-[14.5px] font-semibold text-ink-2 active:bg-chip disabled:text-faint"
        >
          <Icon name="retry" size={16} className={q.isFetching ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>
      {q.isPending ? <DashSkeleton /> : q.isError || !o ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Body o={o} />}
    </>
  )
}

function Body({ o }: { o: AdminOverview }) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const n = o.totals
  const crop = (id: string) => tc(`crops.${id}`, { defaultValue: id })
  const langName = (l: string) => t(`lang.${l}`, { defaultValue: l })

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Stat label={t('farmers')} value={n.farmers} strong />
        <Stat label={t('signupsToday')} value={n.signupsToday} />
        <Stat label={t('signups7d')} value={n.signups7d} />
        <Stat label={t('activeToday')} value={n.activeToday} />
        <Stat label={t('active7d')} value={n.active7d} />
        <Stat label={t('inactive7d')} value={n.inactive7d} warn={n.inactive7d > 0} />
      </div>

      <SectionHead>{t('byDistrict')}</SectionHead>
      <Bars rows={o.byDistrict} total={n.farmers} />
      <SectionHead>{t('byCrop')}</SectionHead>
      <Bars rows={o.byCrop} total={n.farmers} label={crop} />
      <SectionHead>{t('byLang')}</SectionHead>
      <Bars rows={o.byLang} total={n.farmers} label={langName} />

      <SectionHead>{t('recent')}</SectionHead>
      <People rows={o.recent} empty={t('noneYet')} when={(f) => (f.signedUpAt ? t('joined', { date: fmtDate(f.signedUpAt, lang) }) : '')} crop={crop} />

      <SectionHead>{t('inactive')}</SectionHead>
      <People rows={o.inactive} empty={t('noneInactive')} when={(f) => lastSeen(f, o.generatedAt, t)} crop={crop} warn />

      <p className="mx-1 mt-6 flex gap-2 text-[13px] leading-snug text-faint">
        <Icon name="lock" size={15} className="mt-0.5 flex-none" />
        {t('privacy')}
      </p>
    </>
  )
}

function lastSeen(f: AdminFarmer, now: string, t: (k: string, o?: Record<string, unknown>) => string) {
  if (!f.lastSeenAt) return t('neverSeen')
  const days = Math.max(0, Math.floor((Date.parse(now) - Date.parse(f.lastSeenAt)) / 86_400_000))
  return t('seenAgo', { count: days })
}

function Stat({ label, value, strong, warn }: { label: string; value: number; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-[24px] px-4 py-3.5 ${strong ? 'bg-grow text-white' : 'bg-card'}`}>
      <div className={`text-[13px] font-semibold leading-tight ${strong ? 'text-white/80' : 'text-muted'}`}>{label}</div>
      <div className={`num mt-1.5 text-[30px] font-semibold leading-none ${strong ? 'text-white' : warn ? 'text-warn-d' : 'text-ink'}`}>{value.toLocaleString('en-IN')}</div>
    </div>
  )
}

/** One series: a horizontal bar per row, in Arth green, the count and share as text beside it. */
function Bars({ rows, total, label = (k) => k }: { rows: AdminCount[]; total: number; label?: (key: string) => string }) {
  const { t } = useTranslation('admin')
  const [all, setAll] = useState(false)
  if (!rows.length) return <p className="rounded-[24px] bg-card px-4 py-4 text-[15px] text-muted">{t('noneYet')}</p>
  const shown = all ? rows : rows.slice(0, BARS)
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div className="rounded-[24px] bg-card px-4 py-3">
      <table className="w-full border-separate border-spacing-y-1.5">
        <caption className="sr-only">{t('tableCaption')}</caption>
        <tbody>
          {shown.map((r) => {
            const pct = total ? Math.round((r.count / total) * 100) : 0
            return (
              <tr key={r.key} title={`${label(r.key)}: ${r.count} (${pct}%)`}>
                <th scope="row" className="w-[34%] max-w-0 truncate pr-2 text-left text-[14.5px] font-medium text-ink">
                  {label(r.key)}
                </th>
                <td className="pr-2">
                  <span aria-hidden className="block h-3 rounded-r-[4px] bg-grow" style={{ width: `${Math.max(3, (r.count / max) * 100)}%` }} />
                </td>
                <td className="num w-[64px] whitespace-nowrap text-right text-[14px] text-ink">
                  <span className="font-semibold">{r.count}</span> <span className="text-faint">{pct}%</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > BARS ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-11 text-[14.5px] font-semibold text-grow">
          {all ? t('showLess') : t('showAll', { count: rows.length })}
        </button>
      ) : null}
    </div>
  )
}

function People({ rows, empty, when, crop, warn }: { rows: AdminFarmer[]; empty: string; when: (f: AdminFarmer) => string; crop: (id: string) => string; warn?: boolean }) {
  if (!rows.length) return <p className="rounded-[24px] bg-card px-4 py-4 text-[15px] text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-hair overflow-hidden rounded-[24px] bg-card">
      {rows.map((f, i) => (
        <li key={`${f.name}-${f.signedUpAt}-${i}`} className="flex items-start gap-3 px-4 py-3">
          <span className="display flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-grow-l text-[18px] text-grow-d">{f.name.charAt(0).toUpperCase() || '?'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[15.5px] font-semibold text-ink">{f.name}</span>
              <span className={`num flex-none text-[12.5px] font-semibold ${warn ? 'text-warn-d' : 'text-faint'}`}>{when(f)}</span>
            </div>
            <div className="truncate text-[13.5px] text-muted">{[f.village, f.district].filter(Boolean).join(', ')}</div>
            {f.crops.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {f.crops.slice(0, 5).map((c) => (
                  <span key={c} className="rounded-lg bg-chip px-2 py-0.5 text-[12px] font-medium text-ink-2">
                    {crop(c)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function DashSkeleton() {
  return (
    <div role="status" className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[84px]" rounded="rounded-[24px]" />
        ))}
      </div>
      <Skeleton className="h-[180px] w-full" rounded="rounded-[24px]" />
      <Skeleton className="h-[220px] w-full" rounded="rounded-[24px]" />
    </div>
  )
}
