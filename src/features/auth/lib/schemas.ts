import * as z from 'zod'
import type { TFunction } from 'i18next'
import { brokenPasswordRules } from './password-rules'

/** Field rules the auth forms share, with messages in the chosen language. */
export const authFields = (t: TFunction<'auth'>) => ({
    email: z.email(t('validation.emailInvalid')),
    code: z
        .string()
        .transform((code) => code.replace(/\s/g, ''))
        .pipe(z.string().regex(/^\d{6}$/, t('validation.codeInvalid'))),
    /** Six digits from the authenticator app, or a recovery code (the dash optional). */
    twoStepCode: z
        .string()
        .transform((value) => value.replace(/\s/g, ''))
        .pipe(z.string().regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/, t('settings.twoStep.turnOffCodeInvalid')))
})

/**
 * A new password and its confirmation, checked against the rules the browser
 * knows (password-rules.ts). `email` is the address it must not contain.
 */
export function newPasswordCheck(
    t: TFunction<'auth'>,
    values: { password: string; confirmPassword: string },
    email: string | undefined,
    ctx: z.RefinementCtx
) {
    if (brokenPasswordRules(values.password, email).length > 0) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: t('validation.passwordWeak') })
    }
    if (values.password !== values.confirmPassword) {
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: t('validation.passwordsDiffer') })
    }
}
