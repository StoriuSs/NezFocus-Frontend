import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthOptions } from '../api/useAuthOptions'
import { Turnstile, type TurnstileState } from '../components/Turnstile'

export interface TurnstileField {
    /** The widget is on the form: Turnstile is on and this form needs it now. */
    active: boolean
    /** The solved widget's token; null until solved, and again after reset(). */
    token: string | null
    /** The widget to put in the form, or null. */
    widget: ReactNode
    /** What to say when the form is sent before the widget is solved: wait, or it could not load. */
    notReadyMessage: string
    /** After a submit: the token was spent, so draw a fresh widget. */
    reset: () => void
    /** The API asked for a token this page did not know it needed: read its options again. */
    refresh: () => void
}

/**
 * Turnstile on an auth form. `needed`: whether this form asks for it now —
 * always on sign-up and forgot-password, after a few failures on sign-in.
 * With Turnstile off on the API (no site key), `active` stays false and the
 * form sends no token.
 *
 * `offerGoogle`: the page has a "Continue with Google" button, which needs no
 * check; when the widget cannot load, it says so.
 */
export function useTurnstile(needed: boolean, { offerGoogle = false }: { offerGoogle?: boolean } = {}): TurnstileField {
    const { t } = useTranslation('auth')
    const { turnstileSiteKey, providers, refetch } = useAuthOptions()
    const [token, setToken] = useState<string | null>(null)
    const [state, setState] = useState<TurnstileState>('waiting')
    // Each round is a new widget: remounting is how a spent token is replaced.
    const [round, setRound] = useState(0)
    const active = needed && typeof turnstileSiteKey === 'string'

    const reset = useCallback(() => {
        setToken(null)
        setRound((current) => current + 1)
    }, [])

    return {
        active,
        token: active ? token : null,
        widget: active ? (
            <Turnstile
                key={round}
                siteKey={turnstileSiteKey}
                onToken={setToken}
                onState={setState}
                hint={offerGoogle && providers.includes('google') ? t('captcha.orGoogle') : undefined}
            />
        ) : null,
        notReadyMessage: state === 'failed' ? t('captcha.failed') : t('captcha.notYet'),
        reset,
        refresh: refetch
    }
}
