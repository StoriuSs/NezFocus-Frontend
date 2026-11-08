import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Each language by its own name, so a reader finds theirs whatever is on screen. */
export const LANGUAGE_NAMES = [
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'en', name: 'English' }
] as const

/**
 * "Tiếng Việt · English" at the foot of the pages outside the app (C-34,
 * D-64). The language in use is `text-primary` 600 and not a button; the
 * other is a `text` button. The choice is kept in this browser (i18n's
 * detector caches it) until the account stores one.
 */
export function LanguageToggle({ className }: { className?: string }) {
    const { t, i18n } = useTranslation()
    const current = i18n.resolvedLanguage ?? i18n.language

    return (
        <div role='group' aria-label={t('language.label')} className={cn('flex items-center gap-1', className)}>
            {LANGUAGE_NAMES.map(({ code, name }, index) => (
                <Fragment key={code}>
                    {index > 0 && (
                        <span aria-hidden='true' className='text-body-sm text-text-tertiary'>
                            ·
                        </span>
                    )}
                    {code === current ? (
                        <span
                            lang={code}
                            aria-current='true'
                            className='inline-flex h-8 items-center px-3 text-body-sm font-semibold text-text-primary'
                        >
                            {name}
                        </span>
                    ) : (
                        <Button variant='text' size='sm' lang={code} onClick={() => void i18n.changeLanguage(code)}>
                            {name}
                        </Button>
                    )}
                </Fragment>
            ))}
        </div>
    )
}
