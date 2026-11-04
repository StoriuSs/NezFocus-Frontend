import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { AUTH_PATHS, safeRedirect, twoStepPath, withRedirect } from '@/features/auth/lib/paths'
import { twoStepState, useAuthPageState } from '@/features/auth/lib/page-state'
import { authFormError } from '@/features/auth/lib/form-errors'
import { authFields } from '@/features/auth/lib/schemas'
import { useResendCooldown } from '@/features/auth/hooks/useResendCooldown'
import { RESEND_AFTER_SECONDS, recordCodeSent, secondsUntilResend } from '@/features/auth/lib/code-sent'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { SentTo } from '@/features/auth/components/SentTo'
import { forgetSignUpPassword, heldSignUpPassword } from '@/features/auth/lib/sign-up-password'

/** `askPassword`: this tab no longer has the password from sign-up (a reload, a new tab). */
const createSchema = (t: TFunction<'auth'>, askPassword: boolean) =>
    z.object({
        email: authFields(t).email,
        code: authFields(t).code,
        password: askPassword ? z.string().min(1, t('validation.passwordRequired')) : z.string()
    })

type Values = z.input<ReturnType<typeof createSchema>>

/**
 * Confirm an address with the code emailed to it; the API signs in when the
 * code is right. Arrives with the address and either `code-sent` (sign-up just
 * sent one) or `unverified` (sign-in found the address unconfirmed: maybe no
 * code is live).
 *
 * The address it arrived with is shown, not editable: the code belongs to that
 * account. Opened without one (a bookmark, a new tab), the page asks for it.
 *
 * The API also wants the password chosen at sign-up. Sign-up (or sign-in,
 * which found the address unconfirmed) leaves it in memory for this page
 * (sign-up-password.ts), so normally only the code is typed; after a reload
 * the page asks for the password too.
 */
export default function VerifyEmail() {
    const { t } = useTranslation('auth')
    const handedOver = useAuthPageState()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const redirect = params.get('redirect')
    const startSession = useAuthStore((state) => state.startSession)
    const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
    // From when the last code actually went out (sign-up, or a resend), across a reload.
    const cooldown = useResendCooldown(
        secondsUntilResend('email-verify', z.email().safeParse(handedOver.email).success ? handedOver.email : undefined)
    )
    const lockedEmail = z.email().safeParse(handedOver.email).success ? handedOver.email : undefined
    const heldPassword = heldSignUpPassword(lockedEmail)
    const schema = useMemo(() => createSchema(t, !heldPassword), [t, heldPassword])
    const {
        register,
        handleSubmit,
        trigger,
        getValues,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { email: lockedEmail ?? '', code: '', password: '' }
    })

    // The address is known: the code is the only thing left to type.
    useEffect(() => {
        if (lockedEmail) setFocus('code')
    }, [lockedEmail, setFocus])

    const intro =
        handedOver.notice === 'unverified'
            ? t('verifyEmail.notVerifiedYet')
            : handedOver.notice === 'code-sent' && lockedEmail
              ? t('verifyEmail.codeSent')
              : null

    async function onSubmit(values: Values) {
        setMessage(null)
        const { email: address, code, password } = schema.parse(values)
        try {
            await startSession(await authApi.verifyEmail(address, code, heldPassword ?? password))
            forgetSignUpPassword()
            toast.success(t('verifyEmail.done'))
            void navigate(safeRedirect(redirect), { replace: true })
        } catch (error) {
            const failure = authFormError(error)
            if (failure.challenge) {
                forgetSignUpPassword()
                toast.success(t('verifyEmail.done'))
                void navigate(twoStepPath(redirect), { replace: true, state: twoStepState(failure.challenge) })
                return
            }
            // The API gives a wrong code and a wrong password one answer.
            const text = failure.type === 'AUTH_CODE_INVALID' ? t('verifyEmail.codeOrPasswordWrong') : failure.message
            setMessage({ tone: 'error', text })
        }
    }

    async function resend() {
        if (!lockedEmail && !(await trigger('email'))) return
        setMessage(null)
        try {
            const address = lockedEmail ?? getValues('email')
            await authApi.resendVerification(address)
            recordCodeSent('email-verify', address)
            setMessage({ tone: 'info', text: t('verifyEmail.resent') })
            cooldown.start(RESEND_AFTER_SECONDS)
        } catch (error) {
            const failure = authFormError(error)
            // Refused by a limit: the button waits as long as the API asks.
            if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds)
            setMessage({ tone: 'error', text: failure.message })
        }
    }

    return (
        <AuthCard
            title={t('verifyEmail.title')}
            subtitle={t('verifyEmail.subtitle')}
            notice={
                message ? (
                    <Notice tone={message.tone}>{message.text}</Notice>
                ) : intro ? (
                    <Notice tone='info'>{intro}</Notice>
                ) : null
            }
            footer={
                <Link
                    to={withRedirect(AUTH_PATHS.signIn, redirect)}
                    className='font-medium text-primary hover:underline'
                >
                    {t('verifyEmail.backToSignIn')}
                </Link>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                {lockedEmail ? (
                    <SentTo
                        email={lockedEmail}
                        // Back where the address was typed: sign-in found it
                        // unconfirmed, or sign-up sent the code.
                        changeAt={withRedirect(
                            handedOver.notice === 'unverified' ? AUTH_PATHS.signIn : AUTH_PATHS.signUp,
                            redirect
                        )}
                    />
                ) : (
                    <FormField label={t('fields.email')} error={errors.email?.message}>
                        {(control) => <Input type='email' autoComplete='email' {...control} {...register('email')} />}
                    </FormField>
                )}
                <FormField label={t('fields.code')} error={errors.code?.message}>
                    {(control) => (
                        <Input
                            inputMode='numeric'
                            autoComplete='one-time-code'
                            maxLength={7}
                            className='text-center text-lg tracking-[0.5em]'
                            {...control}
                            {...register('code')}
                        />
                    )}
                </FormField>
                {heldPassword ? null : (
                    <FormField
                        label={t('fields.password')}
                        hint={t('verifyEmail.passwordHint')}
                        error={errors.password?.message}
                    >
                        {(control) => (
                            <PasswordInput autoComplete='current-password' {...control} {...register('password')} />
                        )}
                    </FormField>
                )}
                <Button type='submit' className='w-full' disabled={isSubmitting}>
                    {isSubmitting ? t('verifyEmail.submitting') : t('verifyEmail.submit')}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    className='w-full'
                    disabled={cooldown.remaining > 0}
                    onClick={() => void resend()}
                >
                    {cooldown.remaining > 0
                        ? t('verifyEmail.resendIn', { seconds: cooldown.remaining })
                        : t('verifyEmail.resend')}
                </Button>
            </form>
        </AuthCard>
    )
}
