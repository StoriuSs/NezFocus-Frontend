import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { safeSessionStorage } from '@/lib/safe-storage'
import { useSendPasswordSetCode } from '@/features/auth/api/useSendPasswordSetCode'
import { useSetPassword } from '@/features/auth/api/useSetPassword'
import { authFormError } from '@/features/auth/lib/form-errors'
import { authFields, newPasswordCheck, passwordFieldMessage } from '@/features/auth/lib/schemas'
import type { PasswordRule } from '@/features/auth/lib/password-rules'
import { useResendCooldown } from '@/features/auth/hooks/useResendCooldown'
import { Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { PasswordRules } from '@/features/auth/components/PasswordRules'

/** When a code was last sent, so a reload still offers the form it is for. */
const SENT_KEY = 'auth:password-set-code-sent'
/** How long an emailed code works, and how soon another may be sent (the API's limits). */
const CODE_LIFETIME_MS = 10 * 60_000
const RESEND_AFTER_SECONDS = 60

/** The time a code was sent to this address in this tab, if it can still work. */
function sentEarlier(email: string | undefined): number | null {
    try {
        const stored = JSON.parse(safeSessionStorage.get(SENT_KEY) ?? 'null') as { email?: unknown; at?: unknown }
        if (stored?.email !== email || typeof stored?.at !== 'number') return null
        return Date.now() - stored.at < CODE_LIFETIME_MS ? stored.at : null
    } catch {
        return null
    }
}

const createSchema = (t: TFunction<'auth'>, email: string | undefined) =>
    z
        .object({ code: authFields(t).code, password: z.string(), confirmPassword: z.string() })
        .superRefine((values, ctx) => newPasswordCheck(t, values, { email }, ctx))

type Values = z.input<ReturnType<typeof createSchema>>

/** "Google", from the provider ids the API lists. */
const providerNames = (providers: string[]) =>
    providers.map((id) => (id === 'google' ? 'Google' : id.charAt(0).toUpperCase() + id.slice(1))).join(', ')

/**
 * For an account made with Google, which has no password: set one, so the
 * email address and a password sign in too. A code goes to the account's
 * inbox first — the API does not add a password on the strength of a session
 * alone. Once set, the settings page shows "Change password" instead.
 *
 * A code sent earlier still works after a reload (for ten minutes): the page
 * remembers sending it, and "I already have a code" opens the form without
 * sending another — which would replace the one in the inbox.
 */
export function SetPasswordSettings({ email, providers }: { email: string | undefined; providers: string[] }) {
    const { t } = useTranslation('auth')
    const sendPasswordSetCode = useSendPasswordSetCode()
    const setPassword = useSetPassword()
    // Seconds until another code may be sent, when one was sent earlier and still works.
    const [earlier] = useState(() => {
        const at = sentEarlier(email)
        return at === null ? null : Math.max(0, RESEND_AFTER_SECONDS - Math.floor((Date.now() - at) / 1000))
    })
    // 'just-sent': this page sent it; 'earlier': a reload, or the person says they have one.
    const [codeSent, setCodeSent] = useState<'just-sent' | 'earlier' | null>(earlier === null ? null : 'earlier')
    const [sending, setSending] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    const cooldown = useResendCooldown(earlier ?? 0)
    const schema = useMemo(() => createSchema(t, email), [t, email])
    const {
        register,
        handleSubmit,
        control,
        setError,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { code: '', password: '', confirmPassword: '' }
    })
    const password = useWatch({ control, name: 'password' })

    // The form appears once a code is on its way: ready for it.
    useEffect(() => {
        if (codeSent) setFocus('code')
    }, [codeSent, setFocus])

    async function sendCode() {
        setFormError(null)
        setSending(true)
        try {
            await sendPasswordSetCode.mutateAsync()
            safeSessionStorage.set(SENT_KEY, JSON.stringify({ email, at: Date.now() }))
            setCodeSent('just-sent')
            cooldown.start(RESEND_AFTER_SECONDS)
        } catch (error) {
            const failure = authFormError(error)
            if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds)
            setFormError(failure.message)
        } finally {
            setSending(false)
        }
    }

    async function onSubmit(values: Values) {
        setFormError(null)
        setServerRules([])
        const { code, password: newPassword } = schema.parse(values)
        try {
            await setPassword.mutateAsync({ code, newPassword })
            safeSessionStorage.remove(SENT_KEY)
            toast.success(t('settings.setPassword.done'))
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_CODE_INVALID' || failure.type === 'AUTH_CODE_EXPIRED') {
                setError('code', { message: failure.message })
            } else if (failure.passwordRules.length > 0) {
                setServerRules(failure.passwordRules)
            } else {
                setFormError(failure.message)
            }
        }
    }

    const sendLabel = (idle: string) =>
        sending
            ? t('settings.setPassword.sending')
            : cooldown.remaining > 0
              ? t('settings.setPassword.resendIn', { seconds: cooldown.remaining })
              : idle

    return (
        <section className='space-y-4 rounded-xl border bg-background p-6' aria-labelledby='set-password'>
            <div className='space-y-1'>
                <h2 id='set-password' className='text-lg font-semibold'>
                    {t('settings.setPassword.title')}
                </h2>
                <p className='text-sm text-muted-foreground'>
                    {t('settings.setPassword.description', { providers: providerNames(providers) })}
                </p>
            </div>
            {formError ? <Notice tone='error'>{formError}</Notice> : null}

            {!codeSent ? (
                <div className='flex flex-wrap gap-2'>
                    <Button onClick={() => void sendCode()} disabled={sending || cooldown.remaining > 0}>
                        {sendLabel(t('settings.setPassword.sendCode'))}
                    </Button>
                    <Button type='button' variant='ghost' onClick={() => setCodeSent('earlier')}>
                        {t('settings.setPassword.haveCode')}
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                    <Notice tone='info'>
                        {codeSent === 'just-sent'
                            ? t('settings.setPassword.codeSent', { email })
                            : t('settings.setPassword.codeSentEarlier', { email })}
                    </Notice>
                    {/* What a password manager files the new password under. */}
                    <input type='email' autoComplete='username' value={email ?? ''} readOnly hidden />
                    <FormField label={t('fields.code')} error={errors.code?.message}>
                        {(field) => (
                            <Input
                                inputMode='numeric'
                                autoComplete='one-time-code'
                                maxLength={7}
                                className='max-w-48 text-center text-lg tracking-[0.5em]'
                                {...field}
                                {...register('code')}
                            />
                        )}
                    </FormField>
                    <div className='space-y-2'>
                        <FormField
                            label={t('fields.newPassword')}
                            error={errors.password?.message ?? passwordFieldMessage(t, serverRules)}
                        >
                            {(field) => (
                                <PasswordInput
                                    autoComplete='new-password'
                                    {...field}
                                    {...register('password', { onChange: () => setServerRules([]) })}
                                />
                            )}
                        </FormField>
                        <PasswordRules
                            password={password}
                            serverRules={serverRules}
                            showErrors={Boolean(errors.password)}
                        />
                    </div>
                    <FormField label={t('fields.confirmPassword')} error={errors.confirmPassword?.message}>
                        {(field) => (
                            <PasswordInput autoComplete='new-password' {...field} {...register('confirmPassword')} />
                        )}
                    </FormField>
                    <div className='flex flex-wrap gap-2'>
                        <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? t('settings.setPassword.submitting') : t('settings.setPassword.submit')}
                        </Button>
                        <Button
                            type='button'
                            variant='ghost'
                            disabled={cooldown.remaining > 0 || sending}
                            onClick={() => void sendCode()}
                        >
                            {sendLabel(t('settings.setPassword.resend'))}
                        </Button>
                    </div>
                </form>
            )}
        </section>
    )
}
