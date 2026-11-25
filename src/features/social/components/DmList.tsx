import { lazy, Suspense, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useMatch, useNavigate } from 'react-router-dom'
import { Ban, Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ShellContext } from '@/components/shell/shell-context'
import { CountBadge } from '@/components/ui/count-badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { WithTooltip } from '@/components/ui/tooltip'
import { plainMessage, useChannelReadState, useMarkChannelRead, useMentionWords } from '@/features/messaging'
import { useProfile } from '@/features/users'
import { moveFocusInList } from '@/lib/arrow-focus'
import { cn } from '@/lib/utils'
import { useCloseDm } from '../api/useDmActions'
import { useDmList } from '../api/useDms'
import { useRelationships } from '../api/useRelationships'
import { useUnblockPerson } from '../api/useRelationshipActions'
import { useConnectedChatLinks } from '../lib/chat-links'
import { dmStanding } from '../lib/dm-chat'
import { heldDms, previewOf, shownDms } from '../lib/dm-list'
import { nameOf } from '../lib/friends-list'
import { friendsPath, dmPath, SOCIAL_PATHS } from '../lib/paths'
import type { Dm, DmLastMessage } from '../types'
import { PersonAvatar } from './PersonAvatar'
// The column shows with every page of the messages area, drawn before the page's chunk:
// its classes come with the AppShell (D-193, as the dock brings the voice rooms' stylesheet).
import '../social.css'

// "Chặn {Bình}?" (S-DM-02 `block-confirm`), with its words, loaded the first time it is asked.
const ConfirmRelationshipDialog = lazy(() =>
    import('./ConfirmRelationshipDialog').then((module) => ({ default: module.ConfirmRelationshipDialog }))
)

const all = (dms: Dm[]) => dms

/** Block / Unblock off while offline, with "You need a connection" (S-DM-01 › offline): the Tooltip needs a live element around the item. */
function Offline({ offline, children }: { offline: boolean; children: ReactNode }) {
    const { t } = useTranslation()
    if (!offline) return <>{children}</>
    return (
        <WithTooltip label={t('shell.messages.offline')} side='right'>
            <div>{children}</div>
        </WithTooltip>
    )
}

/**
 * The DMs of the messages column (S-DM-01): DMRow (C-30) for each DM shown,
 * the latest active first, held in place while the pointer is over the
 * column (Q5); none yet, "No messages yet" with where to start one.
 *
 * ↑ / ↓ move between rows (the "Friends" row with them: the column's
 * `nav` does it), Enter opens, Delete closes, Shift+F10 or the Menu key opens
 * the row's menu, as a right click does.
 */
export function DmList() {
    const { t } = useTranslation()
    const dms = useDmList(all).data
    const open = useMatch({ path: SOCIAL_PATHS.dm, end: false })?.params.dmId
    const [held, setHeld] = useState<string[] | null>(null)
    const [blocking, setBlocking] = useState<{ userId: string; name: string } | null>(null)
    const rows = useMemo(() => {
        const shown = shownDms(dms ?? [], open)
        return held ? heldDms(held, shown) : shown
    }, [dms, open, held])

    if (dms === undefined) return null
    if (rows.length === 0)
        return (
            <div className='px-3 py-1'>
                <p className='text-body-sm text-text-secondary'>{t('shell.messages.empty')}</p>
                <p className='text-label text-text-tertiary'>{t('shell.messages.emptyHint')}</p>
            </div>
        )
    return (
        <>
            <ul
                className='flex flex-col gap-0.5'
                onPointerEnter={() => setHeld(rows.map((dm) => dm.id))}
                onPointerLeave={() => setHeld(null)}
            >
                {rows.map((dm) => (
                    <DmRow key={dm.id} dm={dm} open={dm.id === open} onBlock={setBlocking} />
                ))}
            </ul>
            {blocking ? (
                <Suspense fallback={null}>
                    <ConfirmRelationshipDialog
                        kind='block'
                        userId={blocking.userId}
                        name={blocking.name}
                        onClose={() => setBlocking(null)}
                    />
                </Suspense>
            ) : null}
        </>
    )
}

/**
 * DMRow (C-30): avatar 32 with their dot (none where I may not message them,
 * nor for someone I blocked or a deleted account), the name (read: 500
 * `text-secondary`; unread: 600 `text-primary` with the count; open: 600 on
 * `surface-2`), the last message under it (the study activity first, from
 * L8). Hover or keyboard focus shows `x` "Close DM" in the count's place.
 */
function DmRow({
    dm,
    open,
    onBlock
}: {
    dm: Dm
    open: boolean
    onBlock: (who: { userId: string; name: string }) => void
}) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const offline = useContext(ShellContext)?.connection === 'offline'
    const me = useProfile().data?.id
    const words = useMentionWords()
    const links = useConnectedChatLinks()
    const unread = useChannelReadState(dm.id)?.unreadCount ?? 0
    const markRead = useMarkChannelRead(dm.id)
    const close = useCloseDm()
    const unblock = useUnblockPerson()
    const blocked =
        useRelationships().data?.some((entry) => entry.type === 'blocked' && entry.user.id === dm.user.id) ?? false
    const standing = dmStanding(dm, blocked)
    const name = nameOf(dm.user) ?? t('shell.messages.deleted')
    const [menuOpen, setMenuOpen] = useState(false)
    const link = useRef<HTMLAnchorElement>(null)
    const plain = useCallback(
        (last: DmLastMessage) =>
            plainMessage(last.content, { users: last.mentionUsers, roles: [], channel: links.channel }, words),
        [links.channel, words]
    )
    // Someone I blocked: their messages hidden in the DM, none on the row either (frame S-DM-03 `blocked-by-me`).
    const preview = blocked
        ? ''
        : previewOf(dm.lastMessage, me, plain, {
              mine: (text) => t('shell.messages.mine', { text }),
              image: t('shell.messages.image'),
              file: t('shell.messages.file'),
              call: t('shell.messages.call')
          })
    const closeDm = () => {
        close.mutate(dm.id)
        // Open here: to the Friends page (S-DM-01 › Đóng tin nhắn).
        if (open) void navigate(friendsPath())
    }

    return (
        <li className='group relative'>
            <NavLink
                ref={link}
                to={dmPath(dm.id)}
                aria-label={unread > 0 ? t('shell.messages.unread', { name, count: unread }) : undefined}
                aria-haspopup='menu'
                className={cn(
                    'flex h-11 items-center gap-2.5 rounded-input px-2 py-1.5 transition-colors duration-micro',
                    open ? 'bg-surface-2' : 'hover:bg-surface-2'
                )}
                onContextMenu={(event) => {
                    event.preventDefault()
                    setMenuOpen(true)
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                        event.preventDefault()
                        setMenuOpen(true)
                    } else if (event.key === 'Delete') {
                        event.preventDefault()
                        // The focus goes on to the next row (else the one before), not to the page.
                        const links = [...(event.currentTarget.closest('nav')?.querySelectorAll('a[href]') ?? [])]
                        const at = links.indexOf(event.currentTarget)
                        const next = (links[at + 1] ?? links[at - 1]) as HTMLElement | undefined
                        closeDm()
                        next?.focus()
                    } else moveFocusInList(event, event.currentTarget.closest('nav'), 'a[href]')
                }}
            >
                <PersonAvatar
                    person={dm.user}
                    presence={standing === 'open' ? dm.presence : null}
                    cutout={open ? 'ring-surface-2' : 'ring-surface-1'}
                    className='size-8'
                    initialClassName='text-label'
                />
                <span className='flex min-w-0 flex-1 flex-col'>
                    <span
                        className={cn(
                            'truncate text-body-sm',
                            open || unread > 0 ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'
                        )}
                    >
                        {name}
                    </span>
                    {preview ? <span className='truncate text-label text-text-tertiary'>{preview}</span> : null}
                </span>
                <CountBadge count={unread} className='shrink-0 group-focus-within:hidden group-hover:hidden' />
            </NavLink>
            <WithTooltip label={t('shell.messages.close')}>
                <button
                    type='button'
                    tabIndex={-1}
                    aria-label={t('shell.messages.closeLabel', { name })}
                    onClick={closeDm}
                    className='absolute right-2 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:text-text-primary group-focus-within:flex group-hover:flex'
                >
                    <X className='size-4' aria-hidden='true' />
                </button>
            </WithTooltip>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                {/* Where the menu hangs: the row's right edge. Never clicked itself. */}
                <DropdownMenuTrigger
                    tabIndex={-1}
                    aria-hidden='true'
                    className='pointer-events-none absolute right-0 top-0 h-11 w-0'
                />
                <DropdownMenuContent
                    side='right'
                    align='start'
                    className='w-56'
                    onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        link.current?.focus()
                    }}
                >
                    {unread > 0 ? (
                        <DropdownMenuItem onSelect={markRead}>
                            <Check aria-hidden='true' />
                            {t('shell.messages.markRead')}
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={closeDm}>
                        <X aria-hidden='true' />
                        {t('shell.messages.close')}
                    </DropdownMenuItem>
                    {standing === 'deleted-account' ? null : (
                        <>
                            <DropdownMenuSeparator />
                            <Offline offline={offline}>
                                {blocked ? (
                                    <DropdownMenuItem disabled={offline} onSelect={() => unblock.mutate(dm.user.id)}>
                                        <Ban aria-hidden='true' />
                                        {t('shell.messages.unblock')}
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        disabled={offline}
                                        onSelect={() => onBlock({ userId: dm.user.id, name })}
                                        className='text-danger focus:text-danger'
                                    >
                                        <Ban aria-hidden='true' />
                                        {t('shell.messages.block')}
                                    </DropdownMenuItem>
                                )}
                            </Offline>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    )
}
