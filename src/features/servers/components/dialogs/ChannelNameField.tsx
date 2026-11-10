import '@/i18n/servers'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Hash, Volume2 } from 'lucide-react'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CHANNEL_NAME_MAX_LENGTH, nameLength, storedName } from '../../lib/channel-layout'
import type { NameKind } from '../../lib/layout-messages'

/**
 * The name of a channel, room or category (S-SRV-05, S-SET-05): a counter,
 * an icon for channels, and for a text channel the line "Sẽ lưu là #…" when
 * the stored name differs from what is typed. What is typed is never changed
 * while typing (that breaks Telex / VNI composing accents, Q10); typing stops
 * at 100 characters, counted as the API counts.
 */
export function ChannelNameField({
    kind,
    value,
    onChange,
    error,
    readOnly,
    inputRef
}: {
    kind: NameKind
    value: string
    onChange: (value: string) => void
    error?: string | null
    readOnly?: boolean
    inputRef?: Ref<HTMLInputElement>
}) {
    const { t } = useTranslation('servers')
    const length = nameLength(value)
    const stored = storedName(kind, value)
    const hint =
        kind === 'text' && stored !== '' && stored !== value.trim()
            ? t('channel.storedAs', { name: stored })
            : undefined
    const Icon = kind === 'text' ? Hash : kind === 'voice' ? Volume2 : null
    const label = kind === 'category' ? t('category.name') : t(`channel.name.${kind}`)

    return (
        <FormField
            label={label}
            error={error ?? undefined}
            hint={hint}
            action={
                <span
                    className={cn(
                        'font-numeric tabular-nums',
                        length >= CHANNEL_NAME_MAX_LENGTH ? 'text-text-secondary' : 'text-text-tertiary'
                    )}
                >
                    {length}/{CHANNEL_NAME_MAX_LENGTH}
                </span>
            }
        >
            {(field) => (
                <div className='relative'>
                    {Icon ? (
                        <Icon
                            className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                            aria-hidden='true'
                        />
                    ) : null}
                    <Input
                        ref={inputRef}
                        {...field}
                        value={value}
                        readOnly={readOnly}
                        autoComplete='off'
                        className={Icon ? 'pl-9' : undefined}
                        onChange={(event) =>
                            onChange([...event.target.value].slice(0, CHANNEL_NAME_MAX_LENGTH).join(''))
                        }
                    />
                </div>
            )}
        </FormField>
    )
}
