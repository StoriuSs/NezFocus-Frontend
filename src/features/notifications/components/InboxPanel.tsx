import {
    Fragment,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type ReactElement
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, CloudOff, EyeOff, Settings, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/notifications'
import '../notifications.css'
import { ConnectionBanner } from '@/components/shell/ConnectionBanner'
import { ShellContext } from '@/components/shell/shell-context'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { PopoverContent } from '@/components/ui/popover'
import { WithTooltip } from '@/components/ui/tooltip'
import { useMentionWords } from '@/features/messaging'
import { friendsPath, useAcceptFriendRequest, useRemoveRelationship } from '@/features/social'
import { settingsCache, USERS_PATHS } from '@/features/users'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { getApiErrorType } from '@/lib/api-error'
import { useToastEdge } from '@/hooks/useToastArea'
import { hideChannelItems, useInbox, useMarkNotificationsRead } from '../api/useInbox'
import { itemsOf, unreadCountOf, withKept } from '../lib/inbox-cache'
import { groupsOf, momentOf, rowTime } from '../lib/inbox-time'
import { isRemoval, isServerItem, isTaskItem, notificationText } from '../lib/notification-text'
import type { InboxPlaces, Notification } from '../types'
import { NotificationRow } from './NotificationRow'

/** Near the end by this much, the next page is read (06 › Phân trang). */
const LOAD_MORE_PX = 240
/** Scrolled this little, the list is still at its top: a new item goes on top. */
const AT_TOP_PX = 8

/** Rows drawn while a page loads: a round 40 and three lines (06 › `loading`). */
function RowSkeletons({ count }: { count: number }) {
    return (
        <div aria-hidden='true' className='flex flex-col gap-0.5'>
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className='flex gap-3 px-2 py-3'>
                    <span className='size-10 shrink-0 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none' />
                    <span className='flex flex-1 flex-col gap-2 pt-1'>
                        <span className='h-3 w-3/5 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none' />
                        <span className='h-3 w-4/5 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none' />
                        <span className='h-3 w-2/5 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none' />
                    </span>
                </div>
            ))}
        </div>
    )
}

/**
 * The inbox (S-NOTI-01): a Popover `panel` (C-15) beside the rail, 440 wide,
 * the app's height less 16 above and below, over the page, no scrim. Its
 * header: "Thông báo", "Đọc hết" while something is unread (up to the newest
 * item held, NOTIF-02), ⚙ to the notification settings. Below it the items,
 * newest first, in day groups whose titles stay on top while scrolling;
 * 30 a page, the next read near the end, until "Đã hiện hết thông báo trong
 * 90 ngày qua". An item arriving while scrolled down leaves the list where it
 * is and shows "↑ N thông báo mới".
 *
 * Clicking a row marks it read (not offline, D-24), closes the inbox and
 * opens the message lit up, or a task's detail on the page one is on (`?task=`,
 * which says itself when the task is gone, 05 Q6); a channel no longer viewed
 * says so and its items leave. ↑ ↓ Home End move between rows, Enter opens one, Tab reaches its ✓.
 * A server item opens the server's settings (handed over) or its first text
 * channel (a timeout); a kick, a ban, a server one is no longer in opens
 * nothing. Opening it reads nothing on its own but the kicks and bans it
 * holds (not offline: 06 › Luật hộp thư, 11 › H1). A friend request has Accept
 * and Decline under its words (the social feature's hooks, as the Friends page):
 * accepted, the API deletes it but it stays here as "now friends" until the
 * inbox closes (06 `friend-accepted`, D-248); declined, it goes with a Toast.
 * `places`: the servers feature's names
 * and paths, handed by the app (D-197).
 */
export default function InboxPanel({ places, onClose }: { places: InboxPlaces; onClose: () => void }) {
    const { t } = useTranslation('notifications')
    const client = useQueryClient()
    const navigate = useNavigate()
    const location = useLocation()
    const inbox = useInbox()
    const markRead = useMarkNotificationsRead()
    const words = useMentionWords()
    const now = useMinuteClock()
    const timeZone = useQuery(settingsCache).data?.timezone
    const connection = useContext(ShellContext)?.connection ?? null
    const offline = connection === 'offline'
    const acceptRequest = useAcceptFriendRequest()
    const declineRequest = useRemoveRelationship()
    /** Requests accepted in this opening: kept, as "now friends", until it closes (D-248). */
    const [accepted, setAccepted] = useState<ReadonlyMap<string, Notification>>(new Map())
    const items = useMemo(() => withKept(itemsOf(inbox.data), accepted), [inbox.data, accepted])
    const positions = useMemo(() => new Map(items.map((item, index) => [item.id, index + 1])), [items])
    const unread = unreadCountOf(inbox.data)
    const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = inbox
    const { mutate: markItemsRead } = markRead
    /** Kicks and bans held, not read: shown here, they are read (06 › Luật hộp thư, 11 › H1). */
    const removals = useMemo(
        () => items.filter((item) => isRemoval(item) && !item.readAt).map((item) => item.id),
        [items]
    )
    /** Those sent while open: once each, a failed mark (the inbox read again, unread) not sent again and again. */
    const removalsSent = useRef(new Set<string>())

    useEffect(() => {
        const fresh = offline ? [] : removals.filter((id) => !removalsSent.current.has(id))
        if (fresh.length === 0) return
        for (const id of fresh) removalsSent.current.add(id)
        markItemsRead({ ids: fresh })
    }, [offline, removals, markItemsRead])

    const list = useRef<HTMLDivElement>(null)
    const panel = useRef<HTMLDivElement>(null)
    // Below 1024 a toast leaves the bottom middle for the window's corner while the inbox is open (C-16).
    useToastEdge('panelRight', panel)
    const [atTop, setAtTop] = useState(true)
    /** The newest item when the list left its top: those after it are "new". */
    const [newestSeen, setNewestSeen] = useState<string | null>(null)
    const [currentId, setCurrentId] = useState<string | null>(null)
    const current = items.some((item) => item.id === currentId) ? currentId : (items[0]?.id ?? null)
    const newCount = atTop || !newestSeen ? 0 : items.filter((item) => item.id > newestSeen).length

    useEffect(() => {
        if (atTop) setNewestSeen(items[0]?.id ?? null)
    }, [atTop, items])

    const loadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
    }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

    // Opened, keyboard focus goes to the first row (06 › Tương tác) once there is one. The list
    // is in the popover's portal, in the page a render after this one: its ref says when.
    const [listShown, setListShown] = useState(false)
    const listRef = useCallback((element: HTMLDivElement | null) => {
        list.current = element
        setListShown(element !== null)
    }, [])
    const focused = useRef(false)
    useEffect(() => {
        if (focused.current || !listShown) return
        focused.current = true
        list.current?.querySelector<HTMLElement>('[data-notification-row]')?.focus()
    }, [listShown])

    // A page too short to scroll reads the next one at once.
    useEffect(() => {
        const element = list.current
        if (
            listShown &&
            element &&
            element.clientHeight > 0 &&
            element.scrollHeight <= element.clientHeight + LOAD_MORE_PX
        )
            loadMore()
    }, [listShown, items.length, loadMore])

    const onScroll = () => {
        const element = list.current
        if (!element) return
        setAtTop(element.scrollTop <= AT_TOP_PX)
        if (element.scrollHeight - element.scrollTop - element.clientHeight < LOAD_MORE_PX) loadMore()
    }

    const toTop = () => {
        list.current?.scrollTo({ top: 0 })
        setAtTop(true)
    }

    const rows = () => [...(list.current?.querySelectorAll<HTMLElement>('[data-notification-row]') ?? [])]
    const onRowKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        // Keys from a row's ✓ (inside a row that is no link) stay with it.
        if (event.target !== event.currentTarget) return
        const all = rows()
        const at = all.indexOf(event.currentTarget)
        const to =
            event.key === 'ArrowDown'
                ? Math.min(at + 1, all.length - 1)
                : event.key === 'ArrowUp'
                  ? Math.max(at - 1, 0)
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? all.length - 1
                      : null
        if (to === null) return
        event.preventDefault()
        all[to]?.focus()
    }

    const open = (item: Notification) => (event: MouseEvent<HTMLAnchorElement>) => {
        const place = item.serverId && item.channelId ? places.placeOf(item.serverId, item.channelId) : undefined
        if (place === null && item.channelId) {
            // S-NOTI-EDGE `lost-access-tap`: stay, and the channel's items go.
            event.preventDefault()
            hideChannelItems(client, item.channelId)
            // A task says what its detail would (05 Q6), once, as the detail keys it.
            if (isTaskItem(item) && item.taskId) toast(t('row.taskGone'), { id: `task-gone-${item.taskId}` })
            else toast(t('inbox.lostAccess'), { icon: <EyeOff className='size-4' aria-hidden='true' /> })
            return
        }
        if (!item.readAt && !offline) markRead.mutate({ ids: [item.id] })
        // Ctrl / ⌘ / Shift: a new tab or window, the inbox stays open.
        if (event.ctrlKey || event.metaKey || event.shiftKey) return
        onClose()
    }

    const pathOf = (item: Notification): string | null => {
        // A request: the Friends page's Pending tab; a friend now: its All tab (the DM in M6 L7).
        if (item.type === 'friend_request') return friendsPath(accepted.has(item.id) ? 'all' : 'pending')
        if (item.type === 'friend_accepted') return friendsPath('all')
        // A server's: its settings, a timeout its first text channel; a kick, a ban, a server left: nowhere.
        if (isServerItem(item)) {
            if (isRemoval(item) || !item.serverId || places.inServer(item.serverId) === false) return null
            return item.type === 'owner_transferred'
                ? places.settingsPath(item.serverId)
                : places.serverPath(item.serverId)
        }
        // A task item always has its task: deleting the task deletes its items (D-200).
        if (isTaskItem(item) && item.taskId) {
            const params = new URLSearchParams(location.search)
            params.set('task', item.taskId)
            return `${location.pathname}?${params.toString()}`
        }
        return item.serverId && item.channelId && item.messageId
            ? places.messagePath(item.serverId, item.channelId, item.messageId)
            : '#'
    }

    /** Accept / Decline of a request (06 › Tương tác): no question, as on the Friends page. */
    const requestActions = (item: Notification) => {
        const actor = item.actor
        if (item.type !== 'friend_request' || !actor || accepted.has(item.id)) return undefined
        const name = actor.displayName ?? actor.username ?? ''
        const tabStop = item.id === current ? 0 : -1
        // Off while offline, saying why (06 › `offline`, D-24): a Tooltip needs a live element around it.
        const gate = (button: ReactElement) =>
            offline ? (
                <WithTooltip label={t('inbox.offline')}>
                    <span>{button}</span>
                </WithTooltip>
            ) : (
                button
            )
        return (
            <>
                {gate(
                    <Button
                        size='sm'
                        tabIndex={tabStop}
                        disabled={offline}
                        onClick={() =>
                            acceptRequest.mutate(actor.id, {
                                onSuccess: () =>
                                    setAccepted((kept) =>
                                        new Map(kept).set(item.id, {
                                            ...item,
                                            readAt: item.readAt ?? new Date().toISOString()
                                        })
                                    ),
                                // Any other failure is the hook's Toast.
                                onError: (error) => {
                                    if (getApiErrorType(error) === 'NOT_FOUND_ERROR')
                                        toast(t('row.requestGone'), {
                                            icon: <UserX className='size-4' aria-hidden='true' />
                                        })
                                }
                            })
                        }
                    >
                        {t('row.accept')}
                    </Button>
                )}
                {gate(
                    <Button
                        size='sm'
                        variant='secondary'
                        tabIndex={tabStop}
                        disabled={offline}
                        onClick={() =>
                            declineRequest.mutate(actor.id, {
                                onSuccess: () => toast(t('row.declined', { name }))
                            })
                        }
                    >
                        {t('row.decline')}
                    </Button>
                )}
            </>
        )
    }

    const readAll = () => {
        const newest = items[0]
        if (newest) markRead.mutate({ beforeId: newest.id })
    }

    const readAllButton = (
        <Button
            variant='text'
            size='sm'
            aria-label={t('inbox.readAllLabel')}
            disabled={offline}
            onClick={readAll}
            className='disabled:pointer-events-none'
        >
            {t('inbox.readAll')}
        </Button>
    )

    let body
    if (inbox.isPending) {
        body = (
            <div role='status' aria-label={t('inbox.loading')} className='px-2 pb-2'>
                <RowSkeletons count={6} />
            </div>
        )
    } else if (inbox.isError && !inbox.data) {
        body = (
            <div className='flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center'>
                <CloudOff className='size-8 text-text-tertiary' aria-hidden='true' />
                <p className='text-body text-text-secondary'>{t('inbox.loadError')}</p>
                <Button variant='secondary' onClick={() => void inbox.refetch()}>
                    {t('inbox.retry')}
                </Button>
            </div>
        )
    } else if (items.length === 0) {
        body = (
            <div className='flex flex-1 items-center justify-center p-6'>
                <EmptyState size='inline' title={t('inbox.emptyTitle')}>
                    {t('inbox.empty')}
                </EmptyState>
            </div>
        )
    } else {
        body = (
            <div ref={listRef} onScroll={onScroll} className='min-h-0 flex-1 overflow-y-auto px-2 pb-2'>
                <div
                    role='feed'
                    aria-label={t('inbox.title')}
                    aria-busy={isFetchingNextPage}
                    className='flex flex-col gap-0.5'
                >
                    {groupsOf(items, now, timeZone).map(({ group, items: grouped }) => (
                        <Fragment key={group}>
                            <h3 className='sticky top-0 z-10 flex h-8 shrink-0 items-center bg-surface-1 px-2 text-label font-semibold uppercase text-text-tertiary'>
                                {t(`group.${group}`)}
                            </h3>
                            {grouped.map((item) => {
                                const at = new Date(item.createdAt)
                                const moment = momentOf(at, timeZone)
                                return (
                                    <NotificationRow
                                        key={item.id}
                                        item={item}
                                        text={notificationText(
                                            item,
                                            { t, words, places, now, timeZone },
                                            accepted.has(item.id)
                                        )}
                                        time={rowTime(at, now, timeZone)}
                                        fullTime={t('row.full', {
                                            weekday: t(`row.weekday_${moment.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6}`),
                                            date: moment.date,
                                            time: moment.time
                                        })}
                                        to={pathOf(item)}
                                        replace={isTaskItem(item)}
                                        current={item.id === current}
                                        offline={offline}
                                        onOpen={open(item)}
                                        onMarkRead={() => markRead.mutate({ ids: [item.id] })}
                                        onFocus={() => setCurrentId(item.id)}
                                        onKeyDown={onRowKeyDown}
                                        position={positions.get(item.id)!}
                                        setSize={hasNextPage ? -1 : items.length}
                                        actions={requestActions(item)}
                                        accepted={accepted.has(item.id)}
                                    />
                                )
                            })}
                        </Fragment>
                    ))}
                </div>
                {isFetchingNextPage ? <RowSkeletons count={2} /> : null}
                {isFetchNextPageError ? (
                    <p className='flex h-10 items-center justify-center gap-1 text-label text-text-tertiary'>
                        {t('inbox.moreError')} ·
                        <Button variant='link' size='sm' className='h-auto px-0' onClick={() => void fetchNextPage()}>
                            {t('inbox.retry')}
                        </Button>
                    </p>
                ) : !hasNextPage ? (
                    <p className='flex h-10 items-center justify-center text-label text-text-tertiary'>
                        {t('inbox.end')}
                    </p>
                ) : null}
            </div>
        )
    }

    return (
        <PopoverContent
            ref={panel}
            side='right'
            align='start'
            sideOffset={8}
            collisionPadding={16}
            aria-label={t('inbox.title')}
            onOpenAutoFocus={(event) => event.preventDefault()}
            className='flex h-[calc(100dvh-32px)] w-[440px] flex-col overflow-hidden p-0'
        >
            <header className='flex h-14 shrink-0 items-center gap-1 pl-4 pr-2'>
                <h2 className='min-w-0 flex-1 truncate text-headline font-semibold text-text-primary'>
                    {t('inbox.title')}
                </h2>
                {unread > 0 && items.length > 0 ? (
                    offline ? (
                        <WithTooltip label={t('inbox.offline')}>
                            <span className='flex'>{readAllButton}</span>
                        </WithTooltip>
                    ) : (
                        readAllButton
                    )
                ) : null}
                <WithTooltip label={t('inbox.settings')}>
                    <IconButton
                        label={t('inbox.settings')}
                        onClick={() => {
                            onClose()
                            void navigate(USERS_PATHS.notifications)
                        }}
                    >
                        <Settings />
                    </IconButton>
                </WithTooltip>
            </header>
            {connection ? <ConnectionBanner status={connection} /> : null}
            <div className='relative flex min-h-0 flex-1 flex-col'>
                {body}
                {newCount > 0 ? (
                    <button
                        type='button'
                        onClick={toTop}
                        className='absolute left-1/2 top-10 z-20 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border bg-surface-2 px-3 text-label font-semibold text-text-primary shadow-float hover:bg-surface-3'
                    >
                        <ArrowUp className='size-4' aria-hidden='true' />
                        {t('inbox.newItems', { count: newCount })}
                    </button>
                ) : null}
            </div>
        </PopoverContent>
    )
}
