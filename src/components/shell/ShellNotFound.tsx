import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import mascotConfused from '@/assets/mascot/runtime-confused-192.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ShellPage } from './ShellPage'

/** The mascot moves wherever it shows: the page holds nothing else. */
const ALWAYS = '(min-width: 0px)'

/**
 * "We can't find this page" inside the AppShell (11 S-MOD-06 `not-found`):
 * the rail and the list column stay, no channel is chosen, no Header (below
 * 1024 only its ☰, to reach the channels); the tab says "Page not found". Shown
 * where a link from the address bar leads to something one may not see or
 * that is gone, saying neither which (NFR-SEC-05, REQ-MSG-05): the URL stays
 * as it was opened. "Back to home" goes to the Study page (D-124); going back
 * to the last opened channel waits until the app remembers it.
 */
export function ShellNotFound() {
    const { t } = useTranslation()
    useDocumentTitle(t('shell.notFound.tab'))
    return (
        <ShellPage title={t('shell.notFound.tab')} bare bodyClassName='flex items-center justify-center px-4'>
            <EmptyState
                mascot={<Mascot mood='confused' size={96} still={mascotConfused} loadWhen={ALWAYS} />}
                title={t('shell.notFound.title')}
                actions={
                    <Button asChild>
                        <Link to='/study'>{t('shell.notFound.home')}</Link>
                    </Button>
                }
            >
                {t('shell.notFound.body')}
            </EmptyState>
        </ShellPage>
    )
}
