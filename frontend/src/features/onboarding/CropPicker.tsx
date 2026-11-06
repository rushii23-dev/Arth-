import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Button, Icon } from '@/components/ui'
import { cropFromText, isCoreCrop, isKnownCrop, MAX_CROP_TEXT, MORE_CROP_GROUPS, searchCrops, type CropGroup, type CropId } from '@/lib/crops'
import { Glyph } from './glyphs'
import { CROPS, toggle } from './model'
import { OptionTile } from './parts'

/**
 * The crops question: the ten core crops as tiles, every other crop the farmer picked
 * as its own tile, and an "Other crops" tile that opens a searchable list of the rest
 * of what Maharashtra grows. A crop missing from that list can be typed in.
 */
export function CropPicker({ crops, onChange, label }: { crops: string[]; onChange: (crops: string[]) => void; label: string }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const extra = crops.filter((c) => !isCoreCrop(c))

  return (
    <>
      <div role="group" aria-label={label} className="mt-3 grid grid-cols-2 gap-2.5">
        {CROPS.map((c) => (
          <OptionTile key={c.value} glyph={c.glyph} label={tc(`crops.${c.value}`)} on={crops.includes(c.value)} onClick={() => onChange(toggle(crops, c.value))} />
        ))}
        {extra.map((c) => (
          <OptionTile key={c} glyph="sprout" label={tc(`crops.${c}`, { defaultValue: c })} on onClick={() => onChange(toggle(crops, c))} />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[108px] flex-col items-center justify-center gap-1.5 rounded-[24px] border-2 border-dashed border-track px-2 py-3 text-center text-ink transition active:bg-chip motion-safe:active:scale-[.97]"
        >
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-chip text-grow-d">
            <Glyph name="plus" size={28} />
          </span>
          <span className="text-[17px] font-semibold leading-tight">{t('otherCrops')}</span>
          <span className="text-[13px] leading-tight text-muted">{t('otherCropsHint')}</span>
        </button>
      </div>
      {extra.length ? <p className="mt-3 px-1 text-[14px] leading-snug text-faint">{t('otherNote')}</p> : null}

      <OtherCropsSheet open={open} onClose={() => setOpen(false)} crops={crops} onChange={onChange} />
    </>
  )
}

function OtherCropsSheet({ open, onClose, crops, onChange }: { open: boolean; onClose: () => void; crops: string[]; onChange: (crops: string[]) => void }) {
  const { t } = useTranslation('onboarding')
  const [query, setQuery] = useState('')
  const extraCount = crops.filter((c) => !isCoreCrop(c)).length

  const close = () => {
    setQuery('')
    onClose()
  }

  const q = query.trim()
  const hits = q ? searchCrops(q) : []
  // what the typed text would be saved as, when it isn't a crop already on the list
  const typed = q ? cropFromText(q) : null
  const own = typed && !isKnownCrop(typed) ? typed : null
  const ownAdded = own !== null && crops.some((c) => c.toLocaleLowerCase() === own.toLocaleLowerCase())

  function addOwn() {
    if (!own || ownAdded) return
    onChange([...crops, own])
    setQuery('')
  }

  return (
    <BottomSheet open={open} onClose={close} title={t('otherCrops')}>
      <p className="px-1 text-[14px] leading-snug text-muted">{t('otherNote')}</p>

      <div className="sticky -top-3 z-10 -mx-1 bg-screen px-1 pb-2 pt-3">
        <label htmlFor="ob-crop-search" className="sr-only">
          {t('otherSearch')}
        </label>
        <div className="relative">
          <Icon name="search" size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input
            id="ob-crop-search"
            type="search"
            value={query}
            maxLength={MAX_CROP_TEXT + 10}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (hits.length === 1 && !crops.includes(hits[0]!)) onChange([...crops, hits[0]!])
              else if (!hits.length) addOwn()
            }}
            placeholder={t('otherSearchPlaceholder')}
            enterKeyHint="search"
            autoComplete="off"
            className="h-[56px] w-full rounded-[22px] bg-card pl-12 pr-4 text-[18px] font-medium text-ink outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-grow"
          />
        </div>
      </div>

      {q ? (
        <>
          {hits.length ? <ChipList ids={hits} crops={crops} onChange={onChange} /> : <p className="mt-2 px-1 text-[15px] text-ink-2">{t('noMatch', { q })}</p>}
          {own && !ownAdded ? (
            <div className="mt-4 rounded-[22px] bg-card px-4 py-3.5">
              <button type="button" onClick={addOwn} className="flex min-h-[48px] w-full items-center gap-3 text-left text-[17px] font-semibold text-grow-d">
                <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-grow text-white">
                  <Glyph name="plus" size={22} />
                </span>
                <span className="min-w-0 break-words">{t('addOwn', { name: own })}</span>
              </button>
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted">{t('addOwnNote')}</p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <OwnCrops crops={crops} onChange={onChange} />
          {(Object.keys(MORE_CROP_GROUPS) as CropGroup[]).map((g) => (
            <section key={g} className="mt-4">
              <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">{t(`cropGroup.${g}`)}</h3>
              <ChipList ids={MORE_CROP_GROUPS[g]} crops={crops} onChange={onChange} />
            </section>
          ))}
        </>
      )}

      {/* runs through the sheet's bottom padding so the list never shows beneath it */}
      <div className="sticky bottom-[calc(-1*max(24px,env(safe-area-inset-bottom)))] -mx-1 -mb-[max(24px,env(safe-area-inset-bottom))] mt-5 bg-screen px-1 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
        <Button onClick={close}>{extraCount ? t('otherDoneCount', { n: extraCount }) : t('otherDone')}</Button>
      </div>
    </BottomSheet>
  )
}

/** Tick-able chips for catalog crops. */
function ChipList({ ids, crops, onChange }: { ids: readonly CropId[]; crops: string[]; onChange: (crops: string[]) => void }) {
  const { t: tc } = useTranslation('common')
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <Chip key={id} on={crops.includes(id)} label={tc(`crops.${id}`)} onClick={() => onChange(toggle(crops, id))} />
      ))}
    </div>
  )
}

/** Crops the farmer typed in themselves, so they can be taken off again here too. */
function OwnCrops({ crops, onChange }: { crops: string[]; onChange: (crops: string[]) => void }) {
  const { t } = useTranslation('onboarding')
  const own = crops.filter((c) => !isKnownCrop(c))
  if (!own.length) return null
  return (
    <section className="mt-4">
      <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">{t('ownCrop')}</h3>
      <div className="flex flex-wrap gap-2">
        {own.map((c) => (
          <Chip key={c} on label={c} onClick={() => onChange(crops.filter((x) => x !== c))} />
        ))}
      </div>
    </section>
  )
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-[48px] items-center gap-1.5 rounded-2xl px-4 text-[16px] font-semibold transition motion-safe:active:scale-[.97] ${
        on ? 'bg-grow text-white' : 'bg-card text-ink-2 active:bg-chip'
      }`}
    >
      {on ? <Icon name="check" size={16} strokeWidth={2.6} /> : null}
      {label}
    </button>
  )
}
