import { brokenPasswordRules, passwordFieldRule, type PasswordContext } from './password-rules'

/**
 * What is wrong with a new password, as a message key (put into words when
 * shown, form-problem.ts), checked against the rules the browser knows
 * (password-rules.ts). `context` is the email and username it must not be
 * (D-66). The length cap and those two are named in the field's error; an
 * unmet condition points at PasswordRules under the field (C-22). No second
 * "type it again" field anywhere (01 Q14).
 */
export function newPasswordIssue(password: string, context: PasswordContext): string | undefined {
    const broken = brokenPasswordRules(password, context)
    const fieldRule = passwordFieldRule(broken)
    if (fieldRule) return `auth:passwordRules.${fieldRule}`
    return broken.length > 0 ? 'auth:validation.passwordWeak' : undefined
}
