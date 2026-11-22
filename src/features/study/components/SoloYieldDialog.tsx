import { useEffect, useState } from 'react'
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
import { serverNow } from '@/lib/server-clock'
import { useSoloSession } from '../api/useSoloSession'
import { soloSecondsAt } from '../lib/solo'
import { askToYieldSolo } from '../study.store'
import { useSoloYield, type SoloYieldAsk } from '../solo-yield.store'
import type { FocusSession } from '../types'

/**
 * Before a room's session ends one's Solo (D-103, C-14 `simple`): "Bắt đầu
 * phiên chung và dừng học một mình?" (08 `start-while-solo-confirm`: "Hủy" /
 * "Bắt đầu") or "Vào phòng và dừng học một mình?" (`join-room-confirm`: "Ở
 * lại" / "Vào phòng"), with the minutes studied so far, which still count
 * (D-234: the counted ones and the stretch running). The focus on the way
 * out. Mounted by the AppShell while one is asked; the Solo gone meanwhile
 * (stopped, expired), the question closes, nothing done: nothing is left to end.
 */
export default function SoloYieldDialog() {
    const asking = useSoloYield((state) => state.asking)
    const close = useSoloYield((state) => state.close)
    const solo = useSoloSession().data?.session ?? null
    const gone = asking !== null && solo === null
    useEffect(() => {
        if (gone) close()
    }, [gone, close])
    if (!asking || !solo) return null
    return <Asking asking={asking} solo={solo} close={close} />
}

function Asking({ asking, solo, close }: { asking: SoloYieldAsk; solo: FocusSession; close: () => void }) {
    const { t } = useTranslation('study')
    // The minutes as it opens: a question does not count up while it is read.
    const [minutes] = useState(() => Math.floor(soloSecondsAt(solo, serverNow()) / 60))
    const body =
        asking.kind === 'start'
            ? minutes > 0
                ? t('yield.startBody', { count: minutes, focus: asking.focusMinutes })
                : t('yield.startBodyShort', { focus: asking.focusMinutes })
            : minutes > 0
              ? t('yield.joinBody', { count: minutes, room: asking.room })
              : t('yield.joinBodyShort', { room: asking.room })
    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t(asking.kind === 'start' ? 'yield.startTitle' : 'yield.joinTitle')}</DialogTitle>
                    <DialogDescription>{body}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type='button' variant='text' onClick={close}>
                        {t(asking.kind === 'start' ? 'yield.cancel' : 'yield.stay')}
                    </Button>
                    <Button
                        type='button'
                        onClick={() => {
                            close()
                            askToYieldSolo(solo.id)
                            asking.confirm()
                        }}
                    >
                        {t(asking.kind === 'start' ? 'yield.start' : 'yield.join')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
