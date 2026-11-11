import { forwardRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox } from '@/components/ui/combobox'
import type { SelectOption } from '@/components/ui/select'
import type { FieldControlProps } from '@/components/form/FormField'
import {
    browserTimeZone,
    matchesTimeZone,
    timeZoneOption,
    timeZoneOptions,
    type TimeZoneOption
} from '@/lib/time-zones'

interface TimeZoneComboboxProps extends Partial<FieldControlProps> {
    /** The IANA name picked. */
    value: string
    onChange: (zone: string) => void
    /** Named by a heading instead of a field label: a settings group's title. */
    'aria-labelledby'?: string
    /** The zone was changed under 24 hours ago (S-ME-04 `timezone-rate-limited`). */
    disabled?: boolean
}

/**
 * The time zone picker (C-25): the `Combobox` over every zone. The first row
 * is always "From your browser", a shortcut that saves the browser's IANA
 * name. While the value is that zone, only that row is ticked. Typing matches
 * the city ("tokyo") or the offset ("+9", "gmt+9").
 */
export const TimeZoneCombobox = forwardRef<HTMLButtonElement, TimeZoneComboboxProps>(function TimeZoneCombobox(
    {
        value,
        onChange,
        id,
        'aria-describedby': describedBy,
        'aria-invalid': invalid,
        'aria-labelledby': labelledBy,
        disabled
    },
    ref
) {
    const { t, i18n } = useTranslation()
    const language = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en'

    const zones = useMemo(() => new Map(timeZoneOptions(language).map((zone) => [zone.id, zone])), [language])
    const options = useMemo<SelectOption[]>(
        () => [...zones.values()].map((zone) => ({ value: zone.id, label: zone.label })),
        [zones]
    )
    const shortcut = useMemo<SelectOption | undefined>(() => {
        const zone = browserTimeZone()
        if (!zone) return undefined
        const option = timeZoneOption(zone, language)
        return { value: option.id, label: t('timeZone.browser', { zone: option.label }) }
    }, [language, t])
    const matches = useCallback(
        (option: SelectOption, query: string) => {
            const zone: TimeZoneOption | undefined = zones.get(option.value)
            return zone !== undefined && matchesTimeZone(zone, query)
        },
        [zones]
    )
    const shown = zones.get(value) ?? timeZoneOption(value, language)

    return (
        <Combobox
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            aria-labelledby={labelledBy}
            disabled={disabled}
            value={value}
            onValueChange={onChange}
            options={options}
            shortcut={shortcut}
            matches={matches}
            display={{ label: shown.label }}
            searchLabel={t('timeZone.search')}
            listLabel={t('timeZone.list')}
            empty={t('timeZone.none')}
        />
    )
})
