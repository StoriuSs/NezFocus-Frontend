import * as z from 'zod'
import type { TFunction } from 'i18next'
import { brokenPasswordRules, passwordFieldRule, type PasswordContext, type PasswordRule } from './password-rules'

/** Field rules the auth forms share, with messages in the chosen language. */
export const authFields = (t: TFunction<'auth'>) => ({
    email: z.email(t('validation.emailInvalid')),
    code: z
        .string()
        .transform((code) => code.replace(/\s/g, ''))
        .pipe(z.string().regex(/^\d{6}$/, t('validation.codeInvalid')))
})

/**
 * A new password and its confirmation, checked against the rules the browser
 * knows (password-rules.ts). `context` is the email and username it must not
 * be (D-66). The length cap and those two are named in the field's error; an
 * unmet condition points at PasswordRules under the field (C-22).
 */
export function newPasswordCheck(
    t: TFunction<'auth'>,
    values: { password: string; confirmPassword: string },
    context: PasswordContext,
    ctx: z.RefinementCtx
) {
    const broken = brokenPasswordRules(values.password, context)
    const fieldRule = passwordFieldRule(broken)
    if (fieldRule) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: t(`passwordRules.${fieldRule}`) })
    } else if (broken.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: t('validation.passwordWeak') })
    }
    if (values.password !== values.confirmPassword) {
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: t('validation.passwordsDiffer') })
    }
}

/** The password field's error for an API refusal that names a field rule (C-22, D-66), if it does. */
export function passwordFieldMessage(t: TFunction<'auth'>, rules: readonly PasswordRule[]): string | undefined {
    const rule = passwordFieldRule(rules)
    return rule ? t(`passwordRules.${rule}`) : undefined
}
