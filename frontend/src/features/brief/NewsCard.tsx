import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Icon, SectionHead, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk } from '@/lib/api/queries'
import type { NewsItem } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { districtLabel } from '@/features/onboarding/model'

/**
 * "News for <district>": today's farming notices from official pages only (IMD, Krishi Vibhag,
 * ICAR, APMC, the collector), found and checked by the backend once a day per district. Each
 * story opens its official page. While it loads: a light skeleton; with nothing to show (or if
 * it fails): one quiet line, never an error.
 */

export function NewsCard({ district }: { district: string | undefined }) {
  const { t } = useTranslation('brief')
  const { lang } = useLang()
  const q = useQuery({
    queryKey: qk.news(lang),
    queryFn: () => api.getNews(lang),
    // the backend refreshes once a day; within a session one answer is enough
    staleTime: 60 * 60_000,
    retry: 1,
  })
  const name = districtLabel(q.data?.district ?? district ?? '', lang)
  const items = (q.data?.items ?? []).slice(0, 4)

  return (
    <section aria-labelledby="news-head">
      <SectionHead>
        <span id="news-head">{name ? t('news.title', { district: name }) : t('news.titleNoDistrict')}</span>
      </SectionHead>
      <div className="overflow-hidden rounded-[28px] bg-card">
        <div className="flex items-center gap-1.5 border-b border-hair px-4 py-2.5 text-[12.5px] font-semibold text-grow-d">
          <Icon name="shield" size={14} />
          {t('news.official')}
        </div>
        {q.isPending ? (
          <div role="status" aria-label={t('news.loading')} className="space-y-4 px-4 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-4/5" rounded="rounded-lg" />
                <Skeleton className="h-3 w-full" rounded="rounded-lg" />
                <Skeleton className="h-3 w-1/3" rounded="rounded-lg" />
              </div>
            ))}
          </div>
        ) : items.length ? (
          <ul className="divide-y divide-hair">
            {items.map((item) => (
              <li key={item.url + item.headline}>
                <Story item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[15px] leading-snug text-muted">{name ? t('news.empty', { district: name }) : t('news.emptyNoDistrict')}</p>
        )}
      </div>
    </section>
  )
}

function Story({ item }: { item: NewsItem }) {
  const { t } = useTranslation('brief')
  const { lang } = useLang()
  const date = fmtDate(item.date, lang)
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer external"
      aria-label={t('news.a11y', { headline: item.headline, source: item.source, date })}
      className="flex items-start gap-3 px-4 py-3.5 active:bg-chip"
    >
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[16px] font-semibold leading-snug text-ink">{item.headline}</span>
        <span className="mt-1 line-clamp-2 block text-[14px] leading-snug text-muted">{item.summary}</span>
        <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-faint">
          <span className="truncate font-semibold text-ink-2">{item.source}</span>
          <span aria-hidden>·</span>
          <span className="num flex-none">{date}</span>
        </span>
      </span>
      <span aria-hidden className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-chip text-ink-2">
        <Icon name="up" size={15} className="rotate-45" />
      </span>
    </a>
  )
}
