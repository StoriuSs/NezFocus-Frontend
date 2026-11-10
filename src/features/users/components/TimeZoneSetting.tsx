import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import '@/i18n/settings'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { TimeZoneCombobox } from '@/components/form/TimeZoneCombobox'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { timeIn, timeZoneOption, wallClock } from '@/lib/time-zones'
import { useUpdateTimeZone } from '@/features/users/api/useUpdateTimeZone'
import type { UserSettings } from '@/features/users/types'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * "Time zone" on S-ME-04: the picker, the time there now, and either what
 * the zone is for or, within 24 hours of a change, when it may change again
 * (`timezone-rate-limited`, in the new zone with its offset). Picking another
 * zone asks first (`timezone-confirm`); the change saves only from there, so
 * it is never shown before the API took it.
 */
export function TimeZoneSetting({ settings }: { settings: UserSettings }) {
    const { t, i18n } = useTranslation('settings')
    const language = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en'
    const now = useMinuteClock()
    const [picked, setPicked] = useState<string | null>(null)

    const zone = settings.timezone
    const changeableAt = settings.timezoneChangeableAt ? new Date(settings.timezoneChangeableAt) : null
    const locked = changeableAt !== null && changeableAt > now

    const change = useUpdateTimeZone()

    function lockedLine(until: Date): string {
        const clock = wallClock(until, zone)
        return t('appearance.timeZoneLocked', {
            time: timeIn(zone, until),
            date: `${pad(clock.day)}/${pad(clock.month)}`,
            gmt: timeZoneOption(zone, language, until).gmt
        })
    }

    return (
        <SettingsGroup id='time-zone' title={t('appearance.timeZone')}>
            <div className='max-w-[400px] space-y-1 py-2'>
                <TimeZoneCombobox
                    aria-labelledby='time-zone'
                    value={zone}
                    disabled={locked}
                    onChange={(next) => next !== zone && setPicked(next)}
                />
                <p className='pt-1 text-label text-text-tertiary'>
                    {t('appearance.timeZoneNow', { time: timeIn(zone, now) })}
                </p>
                {locked && changeableAt ? (
                    <p className='flex gap-1.5 text-label text-text-secondary'>
                        <Clock className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                        {lockedLine(changeableAt)}
                    </p>
                ) : (
                    <p className='text-label text-text-tertiary'>{t('appearance.timeZoneHint')}</p>
                )}
            </div>

            <Dialog open={picked !== null} onOpenChange={(open) => !open && !change.isPending && setPicked(null)}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>
                            {t('appearance.confirm.title', {
                                // One unbreakable unit: "GMT+9 · Tokyo" never splits across lines.
                                zone: picked ? timeZoneOption(picked, language).label.replace(/ /g, ' ') : ''
                            })}
                        </DialogTitle>
                        <DialogDescription>{t('appearance.confirm.text')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className='mt-2'>
                        <Button variant='outline' disabled={change.isPending} onClick={() => setPicked(null)}>
                            {t('appearance.confirm.cancel')}
                        </Button>
                        <Button
                            disabled={change.isPending}
                            onClick={() => picked && change.mutate(picked, { onSettled: () => setPicked(null) })}
                        >
                            {t('appearance.confirm.change')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SettingsGroup>
    )
}
