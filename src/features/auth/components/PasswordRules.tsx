import { useState } from 'react'
import { Circle, CircleCheck, CircleX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { GRID_RULES, brokenPasswordRules, type PasswordRule } from '../lib/password-rules'

interface PasswordRulesProps {
    id?: string
    password: string
    /** Rules the API refused the last submission for (`data.rules`), shown until the password changes. */
    serverRules?: readonly PasswordRule[]
    /**
     * The password field has an error (the form was sent with it unmet): an
     * unmet condition shows as an error. Pass the field's error, not
     * react-hook-form's `isSubmitted`, which stays true after a successful
     * send resets the form and would turn the empty form red.
     */
    showErrors?: boolean
}

type RuleState = 'unmet' | 'met' | 'error'

const ICON = { unmet: Circle, met: CircleCheck, error: CircleX } as const

const TONE: Record<RuleState, { icon: string; text: string }> = {
    unmet: { icon: 'text-text-tertiary', text: 'text-text-tertiary' },
    met: { icon: 'text-success', text: 'text-text-secondary' },
    error: { icon: 'text-danger', text: 'text-danger' }
}

/**
 * The password conditions under a new-password field (C-22, D-29), always
 * shown: two columns, the special-character one across the third row. Each
 * condition is unmet, met, or an error once the form was sent; the icon tells
 * them apart, not only the colour. The length cap and "not your email /
 * username" (D-66) are errors of the field, not conditions here.
 */
export function PasswordRules({ id, password, serverRules = [], showErrors = false }: PasswordRulesProps) {
    const { t } = useTranslation('auth')
    const broken = new Set<PasswordRule>([...brokenPasswordRules(password), ...serverRules])
    const stateOf = (rule: PasswordRule): RuleState =>
        !broken.has(rule) ? 'met' : showErrors || serverRules.includes(rule) ? 'error' : 'unmet'

    // Announce the condition just met (aria-live), not the whole list again.
    const met = GRID_RULES.filter((rule) => !broken.has(rule))
    const metKey = met.join(' ')
    const [seen, setSeen] = useState({ key: metKey, announcement: '' })
    if (seen.key !== metKey) {
        const before = new Set(seen.key.split(' '))
        const newlyMet = met.filter((rule) => !before.has(rule))
        setSeen({
            key: metKey,
            announcement: newlyMet.length
                ? t('passwordRules.nowMet', { rules: newlyMet.map((rule) => t(`passwordRules.${rule}`)).join(', ') })
                : ''
        })
    }

    return (
        <div id={id}>
            <ul className='grid grid-cols-2 gap-x-2 gap-y-1'>
                {GRID_RULES.map((rule) => {
                    const state = stateOf(rule)
                    const Icon = ICON[state]
                    return (
                        <li
                            key={rule}
                            data-rule={rule}
                            data-state={state}
                            className={cn(
                                'flex min-h-5 items-center gap-1.5 text-label',
                                TONE[state].text,
                                rule === 'special' && 'col-span-2'
                            )}
                        >
                            <Icon className={cn('size-3.5 shrink-0', TONE[state].icon)} aria-hidden='true' />
                            <span>
                                {t(`passwordRules.${rule}`)}
                                <span className='sr-only'> ({t(`passwordRules.state.${state}`)})</span>
                            </span>
                        </li>
                    )
                })}
            </ul>
            <p className='sr-only' aria-live='polite'>
                {seen.announcement}
            </p>
        </div>
    )
}
