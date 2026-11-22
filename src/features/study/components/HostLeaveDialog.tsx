import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useNextHost } from '../api/useNextHost'
import { useHostLeave, type HostLeaveAsk } from '../host-leave.store'

/**
 * "Rời phòng?" for the Host of a session not yet ended (07 S-ROOM-04
 * `host-leave-confirm`, C-14 `simple`; D-44, D-50, D-77): who would control
 * the session next, read as it opens (D-233); "Chuyển phòng" from the
 * preview page's switch, "Đăng xuất và rời phòng?" from the menu (10
 * `logout-host-confirm`). The focus on "Ở lại". While the name is read, or
 * if it cannot be, the sentence names nobody. Mounted by the AppShell while
 * one is asked. `joinedSessionId`: the session of the room this tab is in;
 * once it is not the one asked about (put out of the room, the session
 * ended, the call gone), the question closes, nothing done.
 */
export default function HostLeaveDialog({ joinedSessionId }: { joinedSessionId: string | null }) {
    const asking = useHostLeave((state) => state.asking)
    const close = useHostLeave((state) => state.close)
    const stale = asking !== null && asking.sessionId !== joinedSessionId
    useEffect(() => {
        if (stale) close()
    }, [stale, close])
    if (!asking || stale) return null
    return <Asking asking={asking} close={close} />
}

function Asking({ asking, close }: { asking: HostLeaveAsk; close: () => void }) {
    const { t } = useTranslation('study')
    const next = useNextHost(asking.sessionId)
    const body =
        next.data === null
            ? t('hostLeave.nobody')
            : next.data?.displayName
              ? t('hostLeave.next', { name: next.data.displayName })
              : t('hostLeave.unknown')
    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>
                        {t(asking.kind === 'signOut' ? 'hostLeave.titleSignOut' : 'hostLeave.title')}
                    </DialogTitle>
                    <DialogDescription aria-live='polite'>{body}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type='button' variant='text' onClick={close}>
                        {t('hostLeave.stay')}
                    </Button>
                    <Button
                        type='button'
                        onClick={() => {
                            close()
                            asking.confirm()
                        }}
                    >
                        {t(`hostLeave.${asking.kind}`)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
