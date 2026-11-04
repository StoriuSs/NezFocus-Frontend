import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { useTwoFactorStatus } from '@/features/auth/api/useTwoFactorStatus'
import { useSetUpTwoFactor } from '@/features/auth/api/useSetUpTwoFactor'
import { useConfirmTwoFactor } from '@/features/auth/api/useConfirmTwoFactor'
import { useReplaceRecoveryCodes } from '@/features/auth/api/useReplaceRecoveryCodes'
import { useDisableTwoFactor } from '@/features/auth/api/useDisableTwoFactor'
import type { TwoFactorSetUp } from '@/features/auth/types'
import { authFormError } from '@/features/auth/lib/form-errors'
import { Notice } from '@/features/auth/components/AuthCard'

/** Few enough recovery codes left to suggest making new ones. */
const LOW_ON_CODES = 3

const appCodeSchema = (t: TFunction<'auth'>) =>
    z.object({
        code: z
            .string()
            .transform((value) => value.replace(/\s/g, ''))
            .pipe(z.string().regex(/^\d{6}$/, t('twoStep.appCodeInvalid')))
    })

/** Turning off takes a code from the app or a recovery code, as the API does. */
const anyCodeSchema = (t: TFunction<'auth'>) =>
    z.object({
        code: z
            .string()
            .transform((value) => value.replace(/\s/g, ''))
            .pipe(
                z.string().regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/, t('settings.twoStep.turnOffCodeInvalid'))
            )
    })

type CodeValues = { code: string }

/** "JBSW Y3DP EHPK 3PXP": easier to type into an app than one long run. */
const grouped = (secret: string) => secret.replace(/(.{4})(?=.)/g, '$1 ')

async function copy(text: string, t: TFunction<'auth'>) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success(t('settings.twoStep.copied'))
    } catch {
        // No clipboard over plain http, or permission refused: the text is on screen.
        toast.error(t('settings.twoStep.copyFailed'))
    }
}

function download(codes: string[]) {
    const url = URL.createObjectURL(new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${window.location.hostname}-recovery-codes.txt`
    link.click()
    URL.revokeObjectURL(url)
}

/**
 * Keeps the person on the page while recovery codes are on screen: they are
 * shown once, so leaving by accident loses them. Closing or reloading the tab
 * gets the browser's own "Leave site?"; a link inside the app is held until
 * they choose (the returned blocker).
 */
function useHoldWhileShown(shown: boolean) {
    const blocker = useBlocker(shown)
    useEffect(() => {
        if (!shown) return
        const warn = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [shown])
    return blocker
}

/**
 * Two-step sign-in, on the settings page: turn it on (scan the QR code,
 * confirm with a code, save the recovery codes), make new recovery codes, or
 * turn it off (with a code). The API's side is in its docs/auth/two-step-sign-in.md,
 * "Two-step sign-in".
 */
export function TwoStepSettings() {
    const { t } = useTranslation('auth')
    const status = useTwoFactorStatus()
    const setUpTwoFactor = useSetUpTwoFactor()
    const confirmTwoFactor = useConfirmTwoFactor()
    const replaceRecoveryCodes = useReplaceRecoveryCodes()
    const disableTwoFactor = useDisableTwoFactor()
    const [setUp, setSetUp] = useState<TwoFactorSetUp | null>(null)
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)

    const confirmSchema = useMemo(() => appCodeSchema(t), [t])
    const disableSchema = useMemo(() => anyCodeSchema(t), [t])
    const confirmForm = useForm<CodeValues>({ resolver: zodResolver(confirmSchema), defaultValues: { code: '' } })
    const disableForm = useForm<CodeValues>({ resolver: zodResolver(disableSchema), defaultValues: { code: '' } })
    const newCodesForm = useForm<CodeValues>({ resolver: zodResolver(confirmSchema), defaultValues: { code: '' } })
    const blocker = useHoldWhileShown(recoveryCodes !== null)

    async function start() {
        setFormError(null)
        setStarting(true)
        try {
            setSetUp(await setUpTwoFactor.mutateAsync())
        } catch (error) {
            setFormError(authFormError(error).message)
        } finally {
            setStarting(false)
        }
    }

    function cancel() {
        setSetUp(null)
        setFormError(null)
        confirmForm.reset()
    }

    async function confirm(values: CodeValues) {
        setFormError(null)
        try {
            const codes = await confirmTwoFactor.mutateAsync(confirmSchema.parse(values).code)
            setSetUp(null)
            confirmForm.reset()
            setRecoveryCodes(codes)
            toast.success(t('settings.twoStep.turnedOn'))
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_TWO_FACTOR_CODE_INVALID') {
                confirmForm.setError('code', { message: failure.message })
            } else {
                setFormError(failure.message)
            }
        }
    }

    async function replaceCodes(values: CodeValues) {
        setFormError(null)
        try {
            const codes = await replaceRecoveryCodes.mutateAsync(confirmSchema.parse(values).code)
            newCodesForm.reset()
            setRecoveryCodes(codes)
            toast.success(t('settings.twoStep.newCodesDone'))
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_TWO_FACTOR_CODE_INVALID') {
                newCodesForm.setError('code', { message: failure.message })
            } else {
                setFormError(failure.message)
            }
        }
    }

    async function disable(values: CodeValues) {
        setFormError(null)
        try {
            await disableTwoFactor.mutateAsync(disableSchema.parse(values).code)
            disableForm.reset()
            toast.success(t('settings.twoStep.turnedOff'))
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_TWO_FACTOR_CODE_INVALID') {
                disableForm.setError('code', { message: failure.message })
            } else {
                setFormError(failure.message)
            }
        }
    }

    const body = () => {
        if (recoveryCodes) {
            return (
                <div className='space-y-4'>
                    {blocker.state === 'blocked' ? (
                        <div className='space-y-3 rounded-lg border border-destructive/50 p-4' role='alert'>
                            <p className='text-sm font-medium'>{t('settings.twoStep.leaveWarning')}</p>
                            <div className='flex flex-wrap gap-2'>
                                <Button size='sm' onClick={() => blocker.reset()}>
                                    {t('settings.twoStep.stay')}
                                </Button>
                                <Button size='sm' variant='outline' onClick={() => blocker.proceed()}>
                                    {t('settings.twoStep.leave')}
                                </Button>
                            </div>
                        </div>
                    ) : null}
                    <Notice tone='info'>{t('settings.twoStep.codesWarning')}</Notice>
                    <ul
                        aria-label={t('settings.twoStep.codesTitle')}
                        className='grid grid-cols-1 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm tracking-wider sm:grid-cols-2'
                    >
                        {recoveryCodes.map((code) => (
                            <li key={code}>{code}</li>
                        ))}
                    </ul>
                    <div className='flex flex-wrap gap-2'>
                        <Button variant='outline' onClick={() => void copy(recoveryCodes.join('\n'), t)}>
                            {t('settings.twoStep.copyCodes')}
                        </Button>
                        <Button variant='outline' onClick={() => download(recoveryCodes)}>
                            {t('settings.twoStep.downloadCodes')}
                        </Button>
                        <Button onClick={() => setRecoveryCodes(null)}>{t('settings.twoStep.codesDone')}</Button>
                    </div>
                </div>
            )
        }

        if (setUp) {
            return (
                <div className='space-y-6'>
                    <div className='space-y-3'>
                        <h3 className='text-sm font-semibold'>{t('settings.twoStep.scanTitle')}</h3>
                        <p className='text-sm text-muted-foreground'>{t('settings.twoStep.scanHelp')}</p>
                        <p className='text-sm text-muted-foreground'>{t('settings.twoStep.scanAgainHelp')}</p>
                        {/* Dark on white whatever the theme: some apps cannot read a light-on-dark code. */}
                        <div
                            role='img'
                            aria-label={t('settings.twoStep.qrLabel')}
                            className='inline-block rounded-lg bg-white p-3'
                        >
                            <QRCodeSVG value={setUp.otpauthUri} size={176} marginSize={0} aria-hidden />
                        </div>
                        <p className='text-sm text-muted-foreground'>{t('settings.twoStep.manualKey')}</p>
                        <div className='flex flex-wrap items-center gap-2'>
                            <code className='break-all rounded bg-muted px-2 py-1 font-mono text-sm'>
                                {grouped(setUp.secret)}
                            </code>
                            <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                onClick={() => void copy(setUp.secret, t)}
                            >
                                {t('settings.twoStep.copyKey')}
                            </Button>
                        </div>
                    </div>
                    <form onSubmit={confirmForm.handleSubmit(confirm)} className='space-y-3' noValidate>
                        <h3 className='text-sm font-semibold'>{t('settings.twoStep.codeTitle')}</h3>
                        <FormField label={t('fields.appCode')} error={confirmForm.formState.errors.code?.message}>
                            {(control) => (
                                <Input
                                    inputMode='numeric'
                                    autoComplete='one-time-code'
                                    maxLength={7}
                                    className='max-w-48 text-center text-lg tracking-[0.5em]'
                                    {...control}
                                    {...confirmForm.register('code')}
                                />
                            )}
                        </FormField>
                        <div className='flex flex-wrap gap-2'>
                            <Button type='submit' disabled={confirmForm.formState.isSubmitting}>
                                {confirmForm.formState.isSubmitting
                                    ? t('settings.twoStep.confirming')
                                    : t('settings.twoStep.confirm')}
                            </Button>
                            <Button type='button' variant='ghost' onClick={cancel}>
                                {t('settings.twoStep.cancel')}
                            </Button>
                        </div>
                    </form>
                </div>
            )
        }

        if (status.isPending) return <p className='text-sm text-muted-foreground'>{t('settings.twoStep.loading')}</p>
        if (status.isError) return <Notice tone='error'>{t('settings.twoStep.loadFailed')}</Notice>

        if (!status.data.enabled) {
            return (
                <Button onClick={() => void start()} disabled={starting}>
                    {starting ? t('settings.twoStep.turningOn') : t('settings.twoStep.turnOn')}
                </Button>
            )
        }

        const left = status.data.recoveryCodesLeft
        return (
            <div className='space-y-4'>
                <p className='text-sm'>
                    <span className='font-medium'>{t('settings.twoStep.on')}</span>{' '}
                    {t('settings.twoStep.codesLeft', { count: left })}
                </p>
                {left === 0 ? (
                    <Notice tone='error'>{t('settings.twoStep.noCodesLeft')}</Notice>
                ) : left <= LOW_ON_CODES ? (
                    <Notice tone='info'>{t('settings.twoStep.lowOnCodes')}</Notice>
                ) : null}
                <form onSubmit={newCodesForm.handleSubmit(replaceCodes)} className='space-y-3' noValidate>
                    <div className='space-y-1'>
                        <h3 className='text-sm font-semibold'>{t('settings.twoStep.newCodes')}</h3>
                        <p className='text-sm text-muted-foreground'>{t('settings.twoStep.newCodesHelp')}</p>
                    </div>
                    <FormField label={t('fields.appCode')} error={newCodesForm.formState.errors.code?.message}>
                        {(control) => (
                            <Input
                                inputMode='numeric'
                                autoComplete='one-time-code'
                                maxLength={7}
                                className='max-w-48 text-center text-lg tracking-[0.5em]'
                                {...control}
                                {...newCodesForm.register('code')}
                            />
                        )}
                    </FormField>
                    <Button type='submit' variant='outline' disabled={newCodesForm.formState.isSubmitting}>
                        {newCodesForm.formState.isSubmitting
                            ? t('settings.twoStep.newCodesSubmitting')
                            : t('settings.twoStep.newCodesSubmit')}
                    </Button>
                </form>
                <form onSubmit={disableForm.handleSubmit(disable)} className='space-y-3' noValidate>
                    <FormField label={t('fields.twoStepCode')} error={disableForm.formState.errors.code?.message}>
                        {(control) => (
                            <Input
                                autoComplete='one-time-code'
                                spellCheck={false}
                                maxLength={13}
                                className='max-w-60 font-mono'
                                {...control}
                                {...disableForm.register('code')}
                            />
                        )}
                    </FormField>
                    <Button type='submit' variant='outline' disabled={disableForm.formState.isSubmitting}>
                        {disableForm.formState.isSubmitting
                            ? t('settings.twoStep.turningOff')
                            : t('settings.twoStep.turnOff')}
                    </Button>
                </form>
            </div>
        )
    }

    return (
        <section className='space-y-4 rounded-xl border bg-background p-6' aria-labelledby='two-step'>
            <div className='space-y-1'>
                <h2 id='two-step' className='text-lg font-semibold'>
                    {t('settings.twoStep.title')}
                </h2>
                <p className='text-sm text-muted-foreground'>{t('settings.twoStep.description')}</p>
            </div>
            {formError ? <Notice tone='error'>{formError}</Notice> : null}
            {body()}
        </section>
    )
}
