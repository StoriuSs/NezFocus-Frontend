import '@/i18n/servers'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useServerRemovals, type ServerRemoval } from '../../server-removals.store'

/** The first thing one can click on the page now under the dialog: its Header, or `no-server`'s button. */
const FOCUSABLE = ['a[href]', 'button:not([disabled])', 'input:not([disabled])', '[tabindex]:not([tabindex="-1"])']
    .map((selector) => `main ${selector}`)
    .join(', ')

function focusThePage() {
    for (const element of document.querySelectorAll<HTMLElement>(FOCUSABLE)) {
        element.focus()
        if (document.activeElement === element) return
    }
}

/**
 * Kicked or banned while the tab is open (11 S-MOD-02): the page under it has
 * already moved to the next server and the server left the rail; this says
 * so, why when a reason was given, and what follows. One button, no icon,
 * mascot or `danger` (it tells, it is no fault of the reader). "Got it", Esc
 * or the scrim close it, and the next one waiting shows (E4); focus goes to
 * the new page. The minutes studied in its room come with the study rooms.
 * Default export: the AppShell loads it the first time one is waiting.
 */
export default function RemovedDialog() {
    const removal = useServerRemovals((state) => state.queue[0])
    const next = useServerRemovals((state) => state.next)
    if (!removal) return null
    // A new key per server: the next one opens afresh, focused on its own button.
    return <Removed key={removal.serverId} removal={removal} onClose={next} />
}

function Removed({ removal, onClose }: { removal: ServerRemoval; onClose: () => void }) {
    const { t } = useTranslation('servers')
    const banned = removal.by === 'ban'
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                role='alertdialog'
                hideCloseButton
                className='flex max-h-[min(820px,calc(100dvh-48px))] flex-col sm:max-w-dialog'
                onCloseAutoFocus={(event) => {
                    // What had focus is likely gone with the server's page.
                    event.preventDefault()
                    focusThePage()
                }}
            >
                <DialogHeader>
                    {/* A long name: two lines, then "…"; the heading keeps it whole for screen readers.
                        `title-2` (20/28) as the frame, not the title's tight line: clamped, that cut the marks above Ô. */}
                    <DialogTitle className='line-clamp-2 break-words text-title-2'>
                        {t(banned ? 'removed.banTitle' : 'removed.kickTitle', { name: removal.name })}
                    </DialogTitle>
                </DialogHeader>
                {/* A long reason scrolls here; the title and the button stay (C-14). */}
                <DialogDescription asChild>
                    <div className='-mx-6 min-h-0 flex-1 space-y-2 overflow-y-auto px-6'>
                        {removal.reason ? (
                            <p className='whitespace-pre-wrap break-words'>
                                {t('removed.reason', { reason: removal.reason })}
                            </p>
                        ) : null}
                        <p>{t(banned ? 'removed.banAfter' : 'removed.kickAfter')}</p>
                    </div>
                </DialogDescription>
                <DialogFooter>
                    <Button type='button' onClick={onClose}>
                        {t('removed.ok')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
