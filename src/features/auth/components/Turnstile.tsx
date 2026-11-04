import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/hooks/useTheme'

/**
 * Cloudflare Turnstile's widget: proves a person is filling in the form, and
 * hands the page a token the API checks with Cloudflare (the API starter's
 * docs/auth/turnstile.md).
 *
 * Cloudflare's script is loaded only when a form shows the widget, so a site
 * with Turnstile off never contacts Cloudflare. scripts/csp.mjs allows this
 * one origin, for the script and the frame the widget draws in.
 */
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

interface RenderOptions {
    sitekey: string
    theme: 'light' | 'dark'
    language?: string
    size: 'flexible'
    callback: (token: string) => void
    'expired-callback': () => void
    'timeout-callback': () => void
    'error-callback': () => boolean
}

interface TurnstileApi {
    render: (container: HTMLElement, options: RenderOptions) => string | undefined
    remove: (widgetId: string) => void
}

declare global {
    interface Window {
        turnstile?: TurnstileApi
        onTurnstileLoad?: () => void
    }
}

/** The script on its way; once loaded, window.turnstile is the answer. */
let loading: Promise<TurnstileApi> | null = null

/** Cloudflare's script, once per page load. A failed load is tried again by the next widget. */
export function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile)
    loading ??= new Promise<TurnstileApi>((resolve, reject) => {
        const script = document.createElement('script')
        const fail = () => {
            loading = null
            script.remove()
            reject(new Error('Turnstile did not load'))
        }
        // render=explicit: widgets are drawn by render() below, not by the
        // script scanning the page. It calls onload once the API is ready.
        window.onTurnstileLoad = () => {
            if (!window.turnstile) return fail()
            loading = null
            resolve(window.turnstile)
        }
        script.src = `${TURNSTILE_SCRIPT}?render=explicit&onload=onTurnstileLoad`
        script.async = true
        script.onerror = fail
        document.head.appendChild(script)
    })
    return loading
}

export type TurnstileState = 'waiting' | 'solved' | 'failed'

/**
 * The widget. `onToken` gets the token once solved, and null when it expires
 * or fails. A token is good for one check: to get another, remount the widget
 * (useTurnstile does, after every submit).
 *
 * When it cannot load (a blocker, a network that stops Cloudflare) it says so,
 * with a button to try again, and `hint` (another way in that needs no check).
 */
export function Turnstile({
    siteKey,
    onToken,
    onState,
    hint
}: {
    siteKey: string
    onToken: (token: string | null) => void
    onState?: (state: TurnstileState) => void
    hint?: string
}) {
    const { t, i18n } = useTranslation('auth')
    const container = useRef<HTMLDivElement>(null)
    // On the element as data-state too: what the e2e tests wait on.
    const [state, setState] = useState<TurnstileState>('waiting')
    // Bumped by "Try again": draws the widget afresh, loading the script again if it failed.
    const [attempt, setAttempt] = useState(0)
    const latestOnToken = useRef(onToken)
    const latestOnState = useRef(onState)
    useEffect(() => {
        latestOnToken.current = onToken
        latestOnState.current = onState
    })
    useEffect(() => {
        latestOnState.current?.(state)
    }, [state])
    const language = i18n.resolvedLanguage
    // The widget takes its theme when drawn: a change of theme draws it again.
    const theme = useThemeStore((s) => s.resolvedTheme)

    useEffect(() => {
        let widgetId: string | undefined
        let cancelled = false
        loadTurnstile()
            .then((turnstile) => {
                if (cancelled || !container.current) return
                // A fresh widget: whatever the last one solved goes with it.
                setState('waiting')
                latestOnToken.current(null)
                widgetId = turnstile.render(container.current, {
                    sitekey: siteKey,
                    theme,
                    language,
                    size: 'flexible',
                    callback: (token) => {
                        setState('solved')
                        latestOnToken.current(token)
                    },
                    'expired-callback': () => {
                        setState('waiting')
                        latestOnToken.current(null)
                    },
                    'timeout-callback': () => {
                        setState('waiting')
                        latestOnToken.current(null)
                    },
                    'error-callback': () => {
                        // Shown under the widget; Turnstile keeps retrying by itself.
                        setState('failed')
                        latestOnToken.current(null)
                        return true
                    }
                })
            })
            .catch(() => {
                if (!cancelled) setState('failed')
            })
        return () => {
            cancelled = true
            if (widgetId) window.turnstile?.remove(widgetId)
        }
    }, [siteKey, language, theme, attempt])

    return (
        <div className='space-y-2'>
            <div ref={container} className='min-h-[65px]' data-testid='turnstile' data-state={state} />
            {state === 'failed' ? (
                <div className='space-y-2'>
                    <p role='alert' className='text-sm text-destructive'>
                        {t('captcha.couldNotLoad')}
                    </p>
                    <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => {
                            setState('waiting')
                            setAttempt((n) => n + 1)
                        }}
                    >
                        {t('captcha.retry')}
                    </Button>
                    {hint ? <p className='text-sm text-muted-foreground'>{hint}</p> : null}
                </div>
            ) : null}
        </div>
    )
}
