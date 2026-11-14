import { Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'

/**
 * TypingLine (C-10, frame `trabF`): the 24-high strip between the last
 * message and the composer, kept even when no one types so the list never
 * jumps; a "•••" then `label` `text-secondary`: "Bình is typing…", "Bình
 * and Dũng are typing…", "Several people are typing…" (three or more).
 */
export function TypingLine({ names }: { names: string[] }) {
    const { t } = useTranslation('messaging')
    const [first, second] = names
    const text =
        names.length === 0
            ? null
            : names.length === 1
              ? t('typing.one', { name: first })
              : names.length === 2
                ? t('typing.two', { first, second })
                : t('typing.many')
    return (
        <div className='flex h-6 shrink-0 items-center gap-2 px-4 text-label text-text-secondary'>
            {text ? (
                <>
                    <Ellipsis className='size-4 shrink-0 text-text-tertiary' aria-hidden='true' />
                    <span className='truncate'>{text}</span>
                </>
            ) : null}
        </div>
    )
}
