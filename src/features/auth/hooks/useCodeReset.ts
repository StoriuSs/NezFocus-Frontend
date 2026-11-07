import { createElement, useCallback, useRef, useState, type FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'
import { useCountdown } from '@/hooks/useCountdown'
import { authApi } from '@/features/auth/api/auth.api'
import type { TokenResponse } from '@/features/auth/types'
import { recordCodeSent, resendAllowedAt, RESEND_AFTER_SECONDS } from '@/features/auth/lib/code-sent'
import type { RateLimitReason } from '@/features/auth/lib/form-errors'
import { requestFailure, type RequestFailure } from '@/features/auth/lib/form-problem'
import { passwordFieldRule, type PasswordRule } from '@/features/auth/lib/password-rules'
import { newPasswordIssue } from '@/features/auth/lib/schemas'
import { CODE_LENGTH, type CodeInputState } from '@/features/auth/components/CodeInput'

/** Where the code stands: being typed, wrong, or dead (expired or five wrong tries). */
export type CodePhase = 'entering' | 'wrong' | 'expired'

export interface Limit {
    reason?: RateLimitReason
    until: number
}

const createSchema = (email: string) =>
    z.object({ password: z.string() }).superRefine(({ password }, ctx) => {
        const message = newPasswordIssue(password, { email })
        if (message) ctx.addIssue({ code: 'custom', path: ['password'], message })
    })

type Values = z.infer<ReturnType<typeof createSchema>>

interface Options {
    email: string
    /** The API took the code and the password, and started a session here: take it up. */
    onReset: (tokens: TokenResponse) => Promise<void> | void
    /** Why sending the first code failed, when the caller sent it (the settings dialog, D-74). */
    initialFailure?: RequestFailure | null
}

/**
 * A new password with an emailed code (REQ-AUTH-04, D-62): the code, the
 * password and "send again", with every way they can be refused. The page
 * (S-AUTH-04 `reset-form`) and the settings dialog (S-ME-03 `password-otp`,
 * D-74) lay the same pieces out their own way (components/CodeReset.tsx).
 *
 * The API checks the code and sets the password in one call, which ends
 * every earlier session and signs in here.
 */
export function useCodeReset({ email, onReset, initialFailure }: Options) {
    const { t } = useTranslation('auth')
    const codeInput = useRef<HTMLInputElement | null>(null)
    const attachCode = useCallback((node: HTMLInputElement | null) => {
        codeInput.current = node
    }, [])
    const focusCode = useCallback(() => codeInput.current?.focus(), [])
    const [code, setCode] = useState('')
    const [phase, setPhase] = useState<CodePhase>('entering')
    const [problem, setProblem] = useState<RequestFailure | null>(() =>
        initialFailure && !initialFailure.limit ? initialFailure : null
    )
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    // Too many wrong codes (from this network, or for this address): nothing can be sent until it lifts.
    const [codeLimit, setCodeLimit] = useState<Limit | null>(null)
    // Too many code emails: "Send again" waits; the code in hand still works.
    const [resendLimit, setResendLimit] = useState<Limit | null>(() => initialFailure?.limit ?? null)
    const [resendAt, setResendAt] = useState(() => resendAllowedAt('password-reset', email))
    const [sending, setSending] = useState(false)
    const resendIn = useCountdown(resendAt)
    const codeWait = useCountdown(codeLimit?.until)
    const resendWait = useCountdown(resendLimit?.until)

    const [schema] = useState(() => createSchema(email))
    const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } })
    const password = useWatch({ control: form.control, name: 'password' })

    const codeBlocked = codeLimit !== null && codeWait > 0
    const resendBlocked = resendLimit !== null && resendWait > 0

    async function reset({ password: newPassword }: Values) {
        setProblem(null)
        setServerRules([])
        try {
            await onReset(await authApi.resetPassword(email, code, newPassword))
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) {
                setCodeLimit(failure.limit)
                setCode('')
                setPhase('entering')
            } else if (failure.type === 'AUTH_CODE_EXPIRED') {
                setPhase('expired')
                setProblem(failure)
            } else if (failure.type === 'AUTH_CODE_INVALID') {
                // The new password stays: only the code was wrong.
                setPhase('wrong')
                setProblem(failure)
                setTimeout(() => codeInput.current?.focus())
            } else if (failure.passwordRules.length > 0) {
                setServerRules(failure.passwordRules)
                const fieldRule = passwordFieldRule(failure.passwordRules)
                form.setError(
                    'password',
                    { message: fieldRule ? `auth:passwordRules.${fieldRule}` : 'auth:validation.passwordWeak' },
                    { shouldFocus: true }
                )
            } else setProblem(failure)
        }
    }

    async function resend() {
        setSending(true)
        setResendLimit(null)
        try {
            await authApi.forgotPassword(email)
            recordCodeSent('password-reset', email)
            setResendAt(Date.now() + RESEND_AFTER_SECONDS * 1000)
            setCode('')
            setPhase('entering')
            setProblem(null)
            // Hedged like the page: no word on whether the address has an account (NFR-SEC-05).
            toast(t('resetPassword.resent', { email }), {
                icon: createElement(Mail, { className: 'size-4', 'aria-hidden': true })
            })
            setTimeout(() => codeInput.current?.focus())
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setResendLimit(failure.limit)
            else setProblem(failure)
        } finally {
            setSending(false)
        }
    }

    function onSubmit(event: FormEvent) {
        event.preventDefault()
        if (phase === 'expired') return void resend()
        if (codeBlocked) return
        if (code.length < CODE_LENGTH) {
            setPhase('wrong')
            setProblem({ passwordRules: [], offline: false, message: { key: 'auth:validation.codeIncomplete' } })
            codeInput.current?.focus()
            return
        }
        void form.handleSubmit(reset)(event)
    }

    function changeCode(value: string) {
        setCode(value)
        if (phase === 'wrong') {
            setPhase('entering')
            setProblem(null)
        }
    }

    const inputState: CodeInputState =
        codeBlocked || phase === 'expired' ? 'disabled' : phase === 'wrong' ? 'error' : 'default'
    const submitting = form.formState.isSubmitting

    return {
        email,
        /** Hand to the code field. */
        attachCode,
        focusCode,
        code,
        changeCode,
        inputState,
        phase,
        problem,
        form,
        password,
        serverRules,
        clearServerRules: () => setServerRules([]),
        codeBlocked,
        codeLimit,
        codeWait,
        resendBlocked,
        resendLimit,
        resendWait,
        resendIn,
        sending,
        resend,
        onSubmit,
        busy: submitting || (phase === 'expired' && sending),
        submitting,
        /** The main button can do nothing now: busy, or waiting out a limit. */
        submitDisabled:
            submitting || (phase === 'expired' && sending) || codeBlocked || (phase === 'expired' && resendBlocked)
    }
}

export type CodeReset = ReturnType<typeof useCodeReset>
