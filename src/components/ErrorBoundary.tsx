import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import i18n from '@/i18n'

interface Props {
    children: ReactNode
    fallback?: ReactNode
    /** Called when the user chooses "Try Again", before the children re-render. */
    onReset?: () => void
}

interface State {
    hasError: boolean
    error: Error | null
}

/**
 * A deployment replaces the hashed chunk files, so a tab opened before it
 * fails to lazy-load the next route. React caches that rejected import:
 * re-rendering throws the same error again, and only a reload fetches the new
 * build.
 */
export function isChunkLoadError(error: Error | null): boolean {
    if (!error) return false
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        error.message
    )
}

/**
 * Error Boundary component for graceful error handling.
 * Catches JavaScript errors in child component tree and displays fallback UI.
 *
 * Place it *inside* layouts, around the content that can fail, so navigation
 * stays usable. Give it `key={location.pathname}` so navigating away clears it.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary key={pathname}>
 *   <Outlet />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Error tracking gets it from the React root (src/lib/error-tracking.ts).
        console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    private handleRetry = () => {
        this.props.onReset?.()
        this.setState({ hasError: false, error: null })
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }

            const canRetry = !isChunkLoadError(this.state.error)

            return (
                <div className='flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center'>
                    <div className='flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10'>
                        <AlertTriangle className='h-8 w-8 text-destructive' />
                    </div>
                    <div className='space-y-2'>
                        <h2 className='text-xl font-semibold text-foreground'>
                            {i18n.t('errorBoundary.title', { defaultValue: 'Something went wrong' })}
                        </h2>
                        <p className='text-sm text-muted-foreground max-w-md'>
                            {canRetry
                                ? i18n.t('errorBoundary.description', {
                                      defaultValue:
                                          'An unexpected error occurred. Please try again or refresh the page.'
                                  })
                                : i18n.t('errorBoundary.newVersion', {
                                      defaultValue:
                                          'A new version of the app is available. Refresh the page to load it.'
                                  })}
                        </p>
                        {import.meta.env.DEV && this.state.error && (
                            <pre className='mt-4 max-w-lg overflow-auto rounded-md bg-muted p-4 text-left text-xs'>
                                {this.state.error.message}
                            </pre>
                        )}
                    </div>
                    <div className='flex gap-2'>
                        {canRetry && (
                            <Button onClick={this.handleRetry} variant='outline'>
                                <RefreshCw className='mr-2 h-4 w-4' />
                                {i18n.t('buttons.tryAgain', { defaultValue: 'Try again' })}
                            </Button>
                        )}
                        <Button onClick={() => window.location.reload()}>
                            {i18n.t('buttons.refreshPage', { defaultValue: 'Refresh page' })}
                        </Button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
