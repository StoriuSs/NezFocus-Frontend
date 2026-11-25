import { useEffect, useRef, type ReactNode } from 'react'
import { Ban, Copy, Ellipsis, Send, UserCheck, UserPlus, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import type { PersonMoves } from '../hooks/usePersonMoves'
import { profileAction, profileMenu } from '../lib/dm-profile'
import type { RelationshipType, SocialPerson } from '../types'
import { Gated } from './Gated'

const TAG_ICON = { friend: UserCheck, outgoing: Send, blocked: Ban } as const

/**
 * Where we stand and ⋯ (C-50, D-110), in the DM's profile panel and the
 * profile popover (S-CHAT-05, D-253). The button pressed turns into a Tag
 * (or the other way round): the focus, left on nothing, goes to ⋯.
 *
 * `lead`: before them (the popover's "Message"). `moderation`: a server's
 * items in ⋯ (the popover in a server, 04 S-SET-03), set apart above
 * "Block" (09 › S-CHAT-05).
 */
export function ProfileActions({
    person,
    name,
    relationship,
    offline,
    moves,
    lead,
    moderation
}: {
    person: SocialPerson
    name: string
    relationship: RelationshipType
    offline: boolean
    moves: PersonMoves
    lead?: ReactNode
    moderation?: ReactNode
}) {
    const { t } = useTranslation('social')
    const action = profileAction(relationship)
    const menu = profileMenu(relationship)
    const off = offline || moves.busy
    const more = useRef<HTMLButtonElement>(null)
    const shown = 'tag' in action ? action.tag : action.button
    const was = useRef(shown)
    useEffect(() => {
        if (was.current === shown) return
        was.current = shown
        const focused = document.activeElement
        if (!focused || focused === document.body) more.current?.focus()
    }, [shown])
    const undo = menu.undo
        ? {
              unfriend: { label: t('friends.unfriend'), run: moves.unfriend },
              cancel: { label: t('friends.cancel'), run: moves.cancel },
              decline: { label: t('friends.decline'), run: moves.decline },
              unblock: { label: t('friends.unblock'), run: moves.unblock }
          }[menu.undo]
        : null

    return (
        <div className='flex items-center gap-2'>
            {lead}
            {'tag' in action ? (
                <Tag kind={action.tag} label={t(`profile.${action.tag}`)} />
            ) : (
                <Gated offline={offline}>
                    <Button
                        size='sm'
                        variant='outline'
                        disabled={off}
                        aria-busy={moves.busy || undefined}
                        onClick={action.button === 'request' ? moves.request : moves.accept}
                    >
                        {action.button === 'request' ? (
                            <UserPlus aria-hidden='true' />
                        ) : (
                            <UserCheck aria-hidden='true' />
                        )}
                        {t(`profile.${action.button}`)}
                    </Button>
                </Gated>
            )}
            <DropdownMenu>
                <WithTooltip label={t('profile.more')}>
                    <DropdownMenuTrigger asChild>
                        <IconButton
                            ref={more}
                            label={`${t('profile.more')}: ${name}`}
                            className='rounded-button border border-border-input'
                        >
                            <Ellipsis />
                        </IconButton>
                    </DropdownMenuTrigger>
                </WithTooltip>
                <DropdownMenuContent align='end'>
                    <DropdownMenuItem disabled={!person.username} onSelect={moves.copyUsername}>
                        <Copy aria-hidden='true' />
                        {t('profile.copyUsername')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {undo ? (
                        <DropdownMenuItem disabled={off} onSelect={undo.run}>
                            <UserX aria-hidden='true' />
                            {undo.label}
                        </DropdownMenuItem>
                    ) : null}
                    {moderation ? (
                        <>
                            {undo ? <DropdownMenuSeparator /> : null}
                            {moderation}
                            {menu.block ? <DropdownMenuSeparator /> : null}
                        </>
                    ) : null}
                    {menu.block ? (
                        <DropdownMenuItem
                            disabled={off}
                            onSelect={moves.block}
                            className='text-danger focus:text-danger'
                        >
                            <Ban aria-hidden='true' />
                            {t('friends.block')}
                        </DropdownMenuItem>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

/** Where we stand, not a button (D-110 R13): as high as the buttons beside it, on `surface-2`, icon 14. */
function Tag({ kind, label }: { kind: keyof typeof TAG_ICON; label: string }) {
    const Icon = TAG_ICON[kind]
    return (
        <span className='inline-flex h-8 items-center gap-1.5 rounded-badge bg-surface-2 px-3 text-label font-medium text-text-secondary'>
            <Icon className='size-3.5 shrink-0' aria-hidden='true' />
            {label}
        </span>
    )
}
