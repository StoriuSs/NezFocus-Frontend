import { useRouteError } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isChunkLoadError } from '@/components/ErrorBoundary'
import i18n from '@/i18n'

/**
 * Last-resort screen for errors that escape the in-layout ErrorBoundary — a
 * crash in the layout itself or in the root route. Replaces React Router's
 * default developer error page. Deliberately depends on nothing that could
 * itself be the thing that failed (no layout, no queries, no hooks); texts
 * fall back to English if translations are unavailable.
 */
export function RouteErrorPage() {
    const error = useRouteError()
    const err = error instanceof Error ? error : null

    console.error('Route error:', error)

    return (
        <div className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center'>
            <div className='flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10'>
                <AlertTriangle className='h-8 w-8 text-destructive' />
            </div>
            <div className='space-y-2'>
                <h1 className='text-xl font-semibold text-foreground'>
                    {i18n.t('errorBoundary.title', { defaultValue: 'Something went wrong' })}
                </h1>
                <p className='max-w-md text-sm text-muted-foreground'>
                    {isChunkLoadError(err)
                        ? i18n.t('errorBoundary.newVersion', {
                              defaultValue: 'A new version of the app is available. Refresh the page to load it.'
                          })
                        : i18n.t('errorBoundary.routeDescription', {
                              defaultValue:
                                  'An unexpected error occurred. Refresh the page, or go back to the home page.'
                          })}
                </p>
                {import.meta.env.DEV && err && (
                    <pre className='mt-4 max-w-lg overflow-auto rounded-md bg-muted p-4 text-left text-xs'>
                        {err.message}
                    </pre>
                )}
            </div>
            <div className='flex gap-2'>
                {/* Full navigations, not router links: the router tree is what failed. */}
                <Button variant='outline' asChild>
                    <a href='/'>{i18n.t('buttons.home', { defaultValue: 'Home' })}</a>
                </Button>
                <Button onClick={() => window.location.reload()}>
                    {i18n.t('buttons.refreshPage', { defaultValue: 'Refresh page' })}
                </Button>
            </div>
        </div>
    )
}
