import { useCallback, useContext, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, UserPlus, Users, UserX } from 'lucide-react'
import mascotNeutral from '@/assets/mascot/runtime-neutral-240.webp'
import '@/i18n/social'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { ShellContext } from '@/components/shell/shell-context'
import { ShellPage } from '@/components/shell/ShellPage'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { tabPanelProps, Tabs } from '@/components/ui/tabs'
import { WithTooltip } from '@/components/ui/tooltip'
import { settingsCache } from '@/features/users'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getApiErrorType } from '@/lib/api-error'
import { useRelationships } from '../api/useRelationships'
import { useAcceptFriendRequest, useRemoveRelationship, useUnblockPerson } from '../api/useRelationshipActions'
import { useMessagePerson } from '../api/useDmActions'
import { useMyCall } from '../api/useMyCall'
import { AddFriendDialog } from '../components/AddFriendDialog'
import { ConfirmRelationshipDialog, type ConfirmKind } from '../components/ConfirmRelationshipDialog'
import { FriendRow, type FriendRowActions } from '../components/FriendRow'
import { useCallPress } from '../hooks/useCallPress'
import { countsOf, defaultTabOf, groupsOf, heldGroups, nameOf, type FriendGroup } from '../lib/friends-list'
import { tabOf } from '../lib/paths'
import { requestTime } from '../lib/request-time'
import { FRIENDS_TABS, type FriendsTab, type PendingSide, type Relationship } from '../types'
import '../social.css'

/** The mascot moves wherever it shows: an empty Friends page holds nothing else. */
const ALWAYS = '(min-width: 0px)'

/**
 * The Friends page (09 S-DM-02, REQ-SOCIAL-02): four tabs (`?tab=`, changed
 * in place, D-248), a search over the tab shown, the rows of each group, and
 * "Add friend". Everything comes from the list read as the app opened and
 * kept live (D-242). With no friend, request or block at all, only the
 * empty state (S-DM-02 `empty`).
 */
export default function Friends() {
    const { t } = useTranslation('social')
    useDocumentTitle(t('friends.title'))
    const relationships = useRelationships()
    const [params, setParams] = useSearchParams()
    const [adding, setAdding] = useState(false)
    const [side, setSide] = useState<PendingSide>('incoming')
    const [query, setQuery] = useState('')
    const offline = useContext(ShellContext)?.connection === 'offline'
    const list = relationships.data
    const tab = tabOf(params.get('tab')) ?? defaultTabOf(list)

    // The tab in the address, the rest of it kept (a task's detail open over the page, `?task=`).
    const toTab = useCallback(
        (next: FriendsTab) =>
            setParams(
                (before) => {
                    const after = new URLSearchParams(before)
                    after.set('tab', next)
                    return after
                },
                { replace: true }
            ),
        [setParams]
    )

    // No tab in the address (the "Friends" row, 💬): the default one, once the list is read, kept.
    useEffect(() => {
        if (list && !tabOf(params.get('tab'))) toTab(defaultTabOf(list))
    }, [list, params, toTab])

    if (!list && relationships.error) throw relationships.error

    const counts = list ? countsOf(list) : null
    const empty = counts !== null && Object.values(counts).every((count) => count === 0)

    function added(entry: Relationship) {
        const name = nameOf(entry.user) ?? ''
        if (entry.type === 'friend') {
            toTab('all')
            toast(t('toasts.friends', { name }))
        } else {
            setSide('outgoing')
            toTab('pending')
            toast(t('toasts.sent', { name }))
        }
    }

    const button = (
        <Button size='sm' disabled={offline} onClick={() => setAdding(true)}>
            <UserPlus aria-hidden='true' />
            {t('friends.addFriend')}
        </Button>
    )
    // Off while offline, saying why (S-DM-02 `offline`): a Tooltip needs a live element around it.
    const addButton = offline ? (
        <WithTooltip label={t('friends.offline')}>
            <span>{button}</span>
        </WithTooltip>
    ) : (
        button
    )

    return (
        <ShellPage
            title={t('friends.title')}
            icon={Users}
            actions={empty ? undefined : addButton}
            bodyClassName={empty ? 'flex items-center justify-center px-4' : undefined}
        >
            {empty ? (
                <EmptyState
                    mascot={<Mascot mood='neutral' size={96} still={mascotNeutral} loadWhen={ALWAYS} />}
                    title={t('friends.emptyPage.title')}
                    actions={addButton}
                >
                    {t('friends.emptyPage.body')}
                </EmptyState>
            ) : list && counts ? (
                <div className='flex w-full max-w-[720px] flex-col gap-4 px-6 py-6 lg:px-8'>
                    <Tabs
                        id='friends'
                        aria-label={t('friends.tabsLabel')}
                        value={tab}
                        onValueChange={toTab}
                        tabs={FRIENDS_TABS.map((value) =>
                            value === 'pending'
                                ? {
                                      value,
                                      label: t('friends.tabs.pending'),
                                      badge: counts.incoming,
                                      badgeLabel: t('friends.incoming', { count: counts.incoming })
                                  }
                                : { value, label: t(`friends.tabs.${value}`) }
                        )}
                    />
                    <div className='relative'>
                        <Search
                            className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                            aria-hidden='true'
                        />
                        <Input
                            type='search'
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' && query) {
                                    event.preventDefault()
                                    setQuery('')
                                }
                            }}
                            placeholder={t('friends.search')}
                            aria-label={t('friends.search')}
                            className='pl-9'
                        />
                    </div>
                    <div {...tabPanelProps('friends', tab)} className='flex flex-col gap-4'>
                        {tab === 'pending' ? (
                            <div>
                                <SegmentedControl
                                    value={side}
                                    onValueChange={setSide}
                                    segments={(['incoming', 'outgoing'] as const).map((value) => ({
                                        value,
                                        label: t(`friends.sides.${value}`, { count: counts[value] })
                                    }))}
                                />
                            </div>
                        ) : null}
                        <FriendGroups list={list} tab={tab} side={side} query={query} noFriends={counts.friend === 0} />
                    </div>
                </div>
            ) : null}
            {adding ? <AddFriendDialog onClose={() => setAdding(false)} onDone={added} /> : null}
        </ShellPage>
    )
}

/**
 * The groups of the tab shown, held in place while the pointer is on them
 * (`heldGroups`), with the confirm dialogs of ⋯ and the row actions that
 * need no question (S-DM-02 › Tương tác: no question, the row leaves, a
 * Toast).
 */
function FriendGroups({
    list,
    tab,
    side,
    query,
    noFriends
}: {
    list: Relationship[]
    tab: FriendsTab
    side: PendingSide
    query: string
    noFriends: boolean
}) {
    const { t } = useTranslation('social')
    const offline = useContext(ShellContext)?.connection === 'offline'
    const timeZone = useQuery(settingsCache).data?.timezone
    const accept = useAcceptFriendRequest()
    const remove = useRemoveRelationship()
    const unblock = useUnblockPerson()
    const { message } = useMessagePerson()
    const { callPerson } = useCallPress()
    const inCall = useMyCall((my) => my.current !== null).data ?? false
    const [confirming, setConfirming] = useState<{ kind: ConfirmKind; entry: Relationship } | null>(null)
    // Held for the list as it was shown: another tab, side or search shows its own at once.
    const view = `${tab}|${side}|${query}`
    const [held, setHeld] = useState<{ view: string; groups: FriendGroup[] } | null>(null)
    const live = groupsOf(list, tab, query, side)
    const groups = held?.view === view ? heldGroups(held.groups, list) : live
    const shown = groups.filter((group) => group.rows.length > 0)
    const nameIn = (entry: Relationship) => nameOf(entry.user) ?? t('friends.deleted')

    const actions: FriendRowActions = {
        onMessage: (entry) => message(entry.user.id),
        onCall: (entry, video) => void callPerson(entry.user.id, video),
        onAccept: (entry) =>
            accept.mutate(entry.user.id, {
                onSuccess: () => toast(t('toasts.friends', { name: nameIn(entry) })),
                onError: (error) => {
                    // Any other failure is the hook's Toast.
                    if (getApiErrorType(error) === 'NOT_FOUND_ERROR')
                        toast(t('toasts.gone'), { icon: <UserX className='size-4' aria-hidden='true' /> })
                }
            }),
        onDecline: (entry) =>
            remove.mutate(entry.user.id, { onSuccess: () => toast(t('toasts.declined', { name: nameIn(entry) })) }),
        onCancel: (entry) =>
            remove.mutate(entry.user.id, { onSuccess: () => toast(t('toasts.cancelled', { name: nameIn(entry) })) }),
        onUnblock: (entry) =>
            unblock.mutate(entry.user.id, { onSuccess: () => toast(t('toasts.unblocked', { name: nameIn(entry) })) }),
        onUnfriend: (entry) => setConfirming({ kind: 'unfriend', entry }),
        onBlock: (entry) => setConfirming({ kind: 'block', entry })
    }

    const now = new Date()
    return (
        <>
            {shown.length === 0 ? (
                <p className='text-body-sm text-text-secondary'>
                    {query.trim()
                        ? t('friends.empty.noMatch', { query: query.trim() })
                        : (tab === 'online' || tab === 'all') && noFriends
                          ? t('friends.empty.all')
                          : t(`friends.empty.${tab === 'pending' ? side : tab}`)}
                </p>
            ) : (
                <div
                    data-friend-list
                    className='flex flex-col gap-4'
                    onPointerEnter={() => setHeld({ view, groups: live })}
                    onPointerLeave={() => setHeld(null)}
                >
                    {shown.map((group) => (
                        <section
                            key={group.key}
                            aria-labelledby={`friends-group-${group.key}`}
                            className='flex flex-col gap-2'
                        >
                            <h2
                                id={`friends-group-${group.key}`}
                                className={
                                    tab === 'pending'
                                        ? 'sr-only'
                                        : 'pt-2 text-label font-semibold uppercase text-text-tertiary'
                                }
                            >
                                {t(`friends.groups.${group.key}`, { count: group.rows.length })}
                            </h2>
                            <ul className='flex flex-col'>
                                {group.rows.map((entry) => (
                                    <FriendRow
                                        key={entry.user.id}
                                        entry={entry}
                                        offline={offline}
                                        inCall={inCall}
                                        actions={actions}
                                        time={
                                            tab === 'pending' && entry.since
                                                ? requestTime(
                                                      new Date(entry.since),
                                                      now,
                                                      t('friends.yesterday'),
                                                      timeZone
                                                  )
                                                : undefined
                                        }
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
            {confirming ? (
                <ConfirmRelationshipDialog
                    kind={confirming.kind}
                    userId={confirming.entry.user.id}
                    name={nameIn(confirming.entry)}
                    onClose={() => setConfirming(null)}
                />
            ) : null}
        </>
    )
}
