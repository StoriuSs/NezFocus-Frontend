import { Check, Circle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CHECKLIST_RULES, brokenPasswordRules, type PasswordRule } from '../lib/password-rules'

interface PasswordChecklistProps {
    id?: string
    password: string
    email?: string
    /** Rules the API refused the last submission for (`data.rules`), shown until the password changes. */
    serverRules?: PasswordRule[]
}

/**
 * The password rules, ticked off as they are met. Rules only the API checks
 * (a common password, the username) appear once it has refused one.
 */
export function PasswordChecklist({ id, password, email, serverRules = [] }: PasswordChecklistProps) {
    const { t } = useTranslation('auth')
    const broken = new Set(brokenPasswordRules(password, email))
    const extra = [...new Set([...serverRules, ...(broken.has('matches_email') ? ['matches_email' as const] : [])])]
        .filter((rule) => !(CHECKLIST_RULES as readonly string[]).includes(rule))
        .filter((rule) => rule !== 'max_length' || broken.has('max_length'))

    return (
        <div id={id} className='space-y-1 text-xs'>
            <p className='text-muted-foreground'>{t('passwordRules.title')}</p>
            <ul className='grid gap-1 sm:grid-cols-2'>
                {CHECKLIST_RULES.map((rule) => {
                    const met = password.length > 0 && !broken.has(rule)
                    return (
                        <li
                            key={rule}
                            className={`flex items-center gap-1.5 ${met ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
                        >
                            {met ? (
                                <Check className='h-3.5 w-3.5' aria-hidden />
                            ) : (
                                <Circle className='h-3 w-3' aria-hidden />
                            )}
                            <span>
                                {t(`passwordRules.${rule}`)}
                                <span className='sr-only'>
                                    {' '}
                                    ({met ? t('passwordRules.met') : t('passwordRules.unmet')})
                                </span>
                            </span>
                        </li>
                    )
                })}
            </ul>
            {extra.length > 0 ? (
                <ul className='space-y-1' role='alert'>
                    {extra.map((rule) => (
                        <li key={rule} className='flex items-start gap-1.5 text-destructive'>
                            <X className='mt-0.5 h-3.5 w-3.5 shrink-0' aria-hidden />
                            <span>{t(`passwordRules.${rule}`)}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}
