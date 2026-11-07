import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { formatWait } from '@/features/auth/lib/form-errors'
import { useMessageText } from '@/features/auth/lib/form-problem'
import type { CodeReset } from '@/features/auth/hooks/useCodeReset'
import { CodeInput } from './CodeInput'
import { PasswordInput } from './PasswordInput'
import { PasswordRules } from './PasswordRules'

/*
 * The pieces of a new password with an emailed code (hooks/useCodeReset.ts),
 * laid out by the page (S-AUTH-04) and by the settings dialog (S-ME-03
 * `password-otp`, D-74) each in their own order.
 */

/** The six digits. Complete, focus moves on to the password; nothing is sent yet (S-AUTH-04). */
export function ResetCodeField({ reset, visibleLabel }: { reset: CodeReset; visibleLabel?: string }) {
    const { t } = useTranslation('auth')
    const { attachCode, code, changeCode, inputState, form } = reset
    const input = (
        <CodeInput
            ref={attachCode}
            value={code}
            onChange={changeCode}
            onComplete={() => form.setFocus('password')}
            state={inputState}
            label={t('verify.codeLabel')}
        />
    )
    if (!visibleLabel) return input
    return (
        <div className='grid gap-1'>
            <span className='text-label text-text-secondary' aria-hidden='true'>
                {visibleLabel}
            </span>
            {input}
        </div>
    )
}

/** The new password and its conditions (C-22). */
export function ResetPasswordField({ reset }: { reset: CodeReset }) {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const { errors, isSubmitted } = reset.form.formState
    return (
        <div className='space-y-2'>
            <FormField
                label={t('resetPassword.newPassword')}
                error={errors.password?.message ? text({ key: errors.password.message }) : undefined}
            >
                {(field) => (
                    <PasswordInput
                        autoComplete='new-password'
                        readOnly={reset.submitting}
                        {...field}
                        {...reset.form.register('password', { onChange: reset.clearServerRules })}
                    />
                )}
            </FormField>
            <PasswordRules
                password={reset.password}
                serverRules={reset.serverRules}
                showErrors={isSubmitted && Boolean(errors.password)}
            />
        </div>
    )
}

/** What stops the reset now, first that applies: a code limit, a sending limit, a refusal. */
export function ResetNotice({ reset }: { reset: CodeReset }) {
    const text = useMessageText()
    const { codeLimit, resendLimit, problem } = reset
    if (reset.codeBlocked) {
        const key =
            codeLimit?.reason === 'network'
                ? 'auth:limits.codesNetwork'
                : codeLimit?.reason === 'codes'
                  ? 'auth:limits.resetCodesEmail'
                  : 'auth:limits.other'
        return (
            <FormMessage tone='neutral' icon='clock'>
                {text({ key, values: { wait: formatWait(reset.codeWait) } })}
            </FormMessage>
        )
    }
    if (reset.resendBlocked) {
        const key =
            resendLimit?.reason === 'recent_email'
                ? 'auth:limits.resetResendRecent'
                : resendLimit?.reason === 'emails'
                  ? 'auth:limits.resetResendEmails'
                  : resendLimit?.reason === 'network'
                    ? 'auth:limits.resetResendNetwork'
                    : 'auth:limits.other'
        return (
            <FormMessage tone='neutral' icon='clock'>
                {text({ key, values: { wait: formatWait(reset.resendWait) } })}
            </FormMessage>
        )
    }
    if (problem) {
        return (
            <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                {text(problem.message)}
            </FormMessage>
        )
    }
    return null
}

/** "No code? Send again in 54 seconds" / "Send again". Gone once the code is dead or blocked. */
export function ResendLine({ reset }: { reset: CodeReset }) {
    const { t } = useTranslation('auth')
    if (reset.phase === 'expired' || reset.codeBlocked) return null
    return (
        <p className='flex flex-wrap items-center gap-x-1 text-body-sm text-text-secondary'>
            {t('verify.noCode')}{' '}
            {reset.resendIn > 0 ? (
                <span className='font-semibold text-text-tertiary' aria-live='off'>
                    {t('verify.resendIn')} <span className='font-numeric tabular-nums'>{reset.resendIn}</span>{' '}
                    {t('verify.seconds')}
                </span>
            ) : (
                <Button
                    type='button'
                    variant='text'
                    size='sm'
                    className='-mx-3'
                    disabled={reset.resendBlocked || reset.sending}
                    onClick={() => void reset.resend()}
                >
                    {t('verify.resend')}
                </Button>
            )}
        </p>
    )
}
