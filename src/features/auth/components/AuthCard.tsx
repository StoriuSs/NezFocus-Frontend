import type { ReactNode } from 'react'

interface AuthCardProps {
    title: string
    subtitle?: ReactNode
    /** A message above the form: a notice from the previous step, or an error for the whole form. */
    notice?: ReactNode
    children: ReactNode
    /** Links under the form: "No account yet? Create one". */
    footer?: ReactNode
}

/** The frame every sign-in page shares, so they read as one flow. */
export function AuthCard({ title, subtitle, notice, children, footer }: AuthCardProps) {
    return (
        <div className='flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/30 px-4 py-12'>
            <div className='w-full max-w-md space-y-6 rounded-xl border bg-background p-8 shadow-sm sm:p-10'>
                <div className='space-y-2 text-center'>
                    <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
                    {subtitle ? <p className='text-sm text-muted-foreground'>{subtitle}</p> : null}
                </div>
                {notice}
                {children}
                {footer ? <div className='space-y-2 text-center text-sm text-muted-foreground'>{footer}</div> : null}
            </div>
        </div>
    )
}

/** A message in a card: `success` after a finished step, `error` for a failure of the whole form. */
export function Notice({ tone, children }: { tone: 'info' | 'success' | 'error'; children: ReactNode }) {
    const styles = {
        info: 'border-border bg-muted text-foreground',
        success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
        error: 'border-destructive/30 bg-destructive/10 text-destructive'
    }[tone]
    return (
        <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
            {children}
        </p>
    )
}
