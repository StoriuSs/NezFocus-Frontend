import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { AUTH_PATHS, safeRedirect, withRedirect } from '@/features/auth/lib/paths'
import { useTwoStepState } from '@/features/auth/lib/page-state'
import { authFormError } from '@/features/auth/lib/form-errors'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'

type Mode = 'app' | 'recovery'

/** Six digits from the app; a recovery code is ten letters and digits, the dash optional. */
const createSchema = (t: TFunction<'auth'>, mode: Mode) =>
    z.object({
        code: z
            .string()
            .transform((value) => value.replace(/\s/g, ''))
            .pipe(
                mode === 'app'
                    ? z.string().regex(/^\d{6}$/, t('twoStep.appCodeInvalid'))
                    : z.string().regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/, t('twoStep.recoveryCodeInvalid'))
            )
    })

type Values = z.input<ReturnType<typeof createSchema>>

/**
 * The second step of signing in, for an account with two-step sign-in on:
 * the password (or Google) was right, and the API answered with a challenge
 * instead of a session. A code from the authenticator app finishes it; a
 * recovery code does too, for someone without their phone.
 *
 * The challenge came in the navigation state (page-state.ts), or, after
 * Google, in a cookie the API reads itself. It lasts five minutes and five
 * wrong codes; after that the API says so and this page sends the person back
 * to sign in. The account also allows five wrong codes per fifteen minutes,
 * across sign-ins: when those run out, the page says how long to wait, since
 * signing in again straight away would only be refused.
 */
export default function TwoStep() {
    const { t } = useTranslation('auth')
    const handedOver = useTwoStepState()
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const startSession = useAuthStore((state) => state.startSession)
    const [mode, setMode] = useState<Mode>('app')
    const [formError, setFormError] = useState<string | null>(null)
    // The sign-in is over: 'expired' (sign in again), or 'locked' (too many wrong codes: wait first).
    const [ended, setEnded] = useState<'expired' | 'locked' | null>(null)
    const schema = useMemo(() => createSchema(t, mode), [t, mode])
    const {
        register,
        handleSubmit,
        reset,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { code: '' } })

    // The code field is the only thing to do here: ready to type into, and
    // again after switching between an app code and a recovery code.
    useEffect(() => {
        setFocus('code')
    }, [mode, setFocus])

    async function onSubmit(values: Values) {
        setFormError(null)
        const { code } = schema.parse(values)
        try {
            await startSession(await authApi.completeTwoFactor(code, handedOver.challenge))
            void navigate(safeRedirect(params.get('redirect')), { replace: true })
        } catch (error) {
            const failure = authFormError(error)
            if (failure.rateLimitReason === 'wrong_codes') setEnded('locked')
            // Expired, or that was the last wrong code this challenge allows.
            else if (failure.type === 'AUTH_TWO_FACTOR_CHALLENGE_EXPIRED' || failure.attemptsLeft === 0)
                setEnded('expired')
            setFormError(failure.message)
            reset({ code: '' })
            setFocus('code')
        }
    }

    function switchMode() {
        setMode((current) => (current === 'app' ? 'recovery' : 'app'))
        setFormError(null)
        reset({ code: '' })
    }

    return (
        <AuthCard
            title={t('twoStep.title')}
            subtitle={mode === 'app' ? t('twoStep.subtitleApp') : t('twoStep.subtitleRecovery')}
            notice={formError ? <Notice tone='error'>{formError}</Notice> : null}
            footer={
                <Link
                    to={withRedirect(AUTH_PATHS.signIn, params.get('redirect'))}
                    replace
                    className='font-medium text-primary hover:underline'
                >
                    {ended === 'expired' ? t('twoStep.signInAgain') : t('twoStep.backToSignIn')}
                </Link>
            }
        >
            {ended ? null : (
                <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                    <FormField
                        label={mode === 'app' ? t('fields.appCode') : t('fields.recoveryCode')}
                        error={errors.code?.message}
                    >
                        {(control) =>
                            mode === 'app' ? (
                                <Input
                                    key='app'
                                    inputMode='numeric'
                                    autoComplete='one-time-code'
                                    maxLength={7}
                                    className='text-center text-lg tracking-[0.5em]'
                                    {...control}
                                    {...register('code')}
                                />
                            ) : (
                                <Input
                                    key='recovery'
                                    autoComplete='off'
                                    autoCapitalize='characters'
                                    spellCheck={false}
                                    maxLength={13}
                                    placeholder='XXXXX-XXXXX'
                                    className='text-center font-mono text-lg tracking-widest'
                                    {...control}
                                    {...register('code')}
                                />
                            )
                        }
                    </FormField>
                    <Button type='submit' className='w-full' disabled={isSubmitting}>
                        {isSubmitting ? t('twoStep.submitting') : t('twoStep.submit')}
                    </Button>
                    <Button type='button' variant='ghost' className='w-full' onClick={switchMode}>
                        {mode === 'app' ? t('twoStep.useRecoveryCode') : t('twoStep.useAppCode')}
                    </Button>
                </form>
            )}
        </AuthCard>
    )
}
