import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useCreateServerDialog } from '../../create-server.store'
import { useLiveRooms } from '../../hooks/useLiveRooms'
import { LiveRoomRow } from './LiveRoomRow'

const SECTION_TITLE = 'text-label font-semibold uppercase text-text-tertiary'

/**
 * "ĐANG HỌC LÚC NÀY — 2 PHÒNG" on the Study page (08 S-STUDY-01): the rooms
 * studying now in one's servers (`useLiveRooms`), one row each (C-44),
 * divided by lines, no limit, the page scrolling. One Tab stop, ↑ ↓ between
 * rows, Enter opens. Loading: two rows of Skeleton. None: "Chưa có phòng
 * nào đang học" (`no-active-rooms`); in no server: "Bạn chưa ở server
 * nào" with "Tạo server" and "Nhập mã mời" (`no-server`); both an
 * EmptyState with no Runtime, in the page's size as the frames draw them;
 * offline: why there is no list, nothing old shown (`offline`); the first
 * read failed: why, and "Thử lại" (a read again failing keeps the list).
 */
export default function LiveRooms() {
    const { t } = useTranslation('study')
    const { t: tCommon } = useTranslation()
    const { servers, ready, rows, count } = useLiveRooms()
    const online = useBrowserOnline()
    const show = useCreateServerDialog((state) => state.show)
    const showJoin = useCreateServerDialog((state) => state.showJoin)
    const [active, setActive] = useState(0)
    const links = useRef<(HTMLAnchorElement | null)[]>([])

    const listed = online && servers.data !== undefined && count > 0
    const title = listed ? t('overview.rooms.titleCount', { count }) : t('overview.rooms.title')
    // The row holding the list's Tab stop: the last one focused, or the first not fading out.
    const current = rows[active] && !rows[active].leaving ? active : rows.findIndex((row) => !row.leaving)

    const move = (event: KeyboardEvent, index: number) => {
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        if (step === 0) return
        let next = index + step
        while (rows[next]?.leaving) next += step
        if (!rows[next]) return
        event.preventDefault()
        setActive(next)
        links.current[next]?.focus()
    }

    let body
    if (!online) {
        body = <p className='px-2 text-label text-text-secondary'>{t('overview.rooms.offline')}</p>
    } else if (servers.isError && !servers.data) {
        body = (
            <div className='flex flex-col items-start gap-2 px-2'>
                <p className='text-label text-text-secondary'>{t('overview.rooms.error')}</p>
                <Button type='button' variant='text' size='sm' onClick={() => void servers.refetch()}>
                    {tCommon('buttons.tryAgain')}
                </Button>
            </div>
        )
    } else if (!servers.data || (!ready && servers.data.length > 0)) {
        body = (
            <div aria-busy='true' className='flex flex-col'>
                {[0, 1].map((key) => (
                    <div key={key} className='flex h-[84px] flex-col justify-center gap-2 p-3'>
                        <Skeleton className='h-4 w-40 rounded-badge bg-surface-2' />
                        <Skeleton className='h-5 w-56 rounded-badge bg-surface-2' />
                        <Skeleton className='h-4 w-48 rounded-badge bg-surface-2' />
                    </div>
                ))}
            </div>
        )
    } else if (servers.data.length === 0) {
        body = (
            <EmptyState
                className='max-w-none items-start px-2 text-left'
                title={t('overview.rooms.noServerTitle')}
                actions={
                    <>
                        <Button variant='outline' size='sm' onClick={() => show('study')}>
                            {t('overview.rooms.create')}
                        </Button>
                        <Button variant='text' size='sm' onClick={showJoin}>
                            {t('overview.rooms.joinByCode')}
                        </Button>
                    </>
                }
            >
                {t('overview.rooms.noServerBody')}
            </EmptyState>
        )
    } else if (rows.length === 0) {
        body = (
            <EmptyState className='max-w-none items-start px-2 text-left' title={t('overview.rooms.emptyTitle')}>
                {t('overview.rooms.emptyBody')}
            </EmptyState>
        )
    } else {
        body = (
            <ul className='flex flex-col'>
                {rows.map((row, index) => (
                    <li key={row.room.channelId} className='border-t first:border-t-0'>
                        <LiveRoomRow
                            ref={(element) => {
                                links.current[index] = element
                            }}
                            room={row.room}
                            leaving={row.leaving}
                            tabIndex={index === current ? 0 : -1}
                            onKeyDown={(event) => move(event, index)}
                            onFocus={() => setActive(index)}
                        />
                    </li>
                ))}
            </ul>
        )
    }

    return (
        <section aria-labelledby='live-rooms-title' className='flex flex-col gap-3'>
            <h2 id='live-rooms-title' className={SECTION_TITLE}>
                {title}
            </h2>
            {body}
        </section>
    )
}
