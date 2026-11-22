import { CircleDot, Crown, LayoutGrid, UserRound, UserRoundX, Video } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { RoomSession } from '@/features/study'
import { chooseRoomView, personName, useVoiceStore, type RoomPerson } from '@/features/voice'

/**
 * Who controls the session, by the room's name in its Header (ChipStatus,
 * C-04, 07 S-ROOM-02): "Bạn đang điều khiển" (`crown`), "An đang điều
 * khiển" (`user-round`), "Chưa có người điều khiển" (`user-round-x`). 28
 * high, a `border` edge, no ground, `text-secondary`; never pressed. A Host
 * not on the room's list (away, kept 3 minutes, STUDY-03) shows none.
 */
export function HostChip({ session, people, me }: { session: RoomSession; people: RoomPerson[]; me: string }) {
    const { t } = useTranslation()
    const host = session.hostId ? people.find((person) => person.user.id === session.hostId) : undefined
    if (session.hostId && session.hostId !== me && !host) return null
    const [Icon, text] =
        session.hostId === null
            ? [UserRoundX, t('shell.voice.hostNone')]
            : session.hostId === me
              ? [Crown, t('shell.voice.hostYou')]
              : [
                    UserRound,
                    t('shell.voice.hostOther', {
                        name: (host && personName(host.user)) ?? t('shell.voice.deletedAccount')
                    })
                ]
    return (
        <span className='ml-2 inline-flex h-7 min-w-0 shrink items-center gap-1.5 rounded-full border px-3 text-label font-medium text-text-secondary'>
            <Icon className='size-3.5 shrink-0' aria-hidden='true' />
            <span className='truncate'>{text}</span>
        </span>
    )
}

/**
 * Ring or grid, in a joined study room's Header (SegmentedControl `view`,
 * C-26a, D-55, D-57): "Vòng" · "Lưới" with the cameras on ("📹1", none when
 * 0), the same in every study room, remembered by the browser.
 */
export function RoomViewSwitch({ cameras }: { cameras: number }) {
    const { t } = useTranslation()
    const label = useId()
    const view = useVoiceStore((state) => state.roomView)
    return (
        <>
            <span id={label} className='sr-only'>
                {t('shell.voice.view')}
            </span>
            <SegmentedControl
                variant='view'
                aria-labelledby={label}
                value={view}
                onValueChange={chooseRoomView}
                segments={[
                    { value: 'ring', label: t('shell.voice.viewRing'), icon: <CircleDot aria-hidden='true' /> },
                    {
                        value: 'grid',
                        label: t('shell.voice.viewGrid'),
                        icon: <LayoutGrid aria-hidden='true' />,
                        suffix:
                            cameras > 0 ? (
                                <span className='inline-flex items-center gap-0.5 font-numeric tabular-nums'>
                                    <Video aria-hidden='true' className='!size-3' />
                                    <span className='sr-only'>{t('shell.voice.cameras', { count: cameras })}</span>
                                    <span aria-hidden='true'>{cameras}</span>
                                </span>
                            ) : undefined
                    }
                ]}
            />
        </>
    )
}
