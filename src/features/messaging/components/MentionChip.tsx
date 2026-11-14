import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/messaging'
import { cn } from '@/lib/utils'
import { useMentionWords } from '../hooks/useMentionWords'
import type { MentionPart } from '../lib/markdown'
import { mentionName, type MentionNames } from '../lib/mentions'
import { CHIP } from './MessageLinkChip'

/** How a message's mentions show: its names, and who reads it (a mention of them is theirs). */
export interface ContentMentions {
    names: MentionNames
    /** @everyone in effect (the message's `mention_everyone`): otherwise the words are only words. */
    everyone: boolean
    me: string | undefined
    roleIds: readonly string[]
}

const MENTION = 'rounded-badge px-1 font-semibold'
const THEIRS = 'bg-surface-2 text-primary'
/** One's own: `text-primary` words on `surface-3`, never `primary` (C-10, DESIGN.md › Cặp bị cấm). */
const MINE = 'bg-surface-3 text-text-primary'

/**
 * A mention in a message (C-10 › Nội dung đặc biệt): a person or a role as
 * "@name" on `surface-2` in `primary` 600, one's own (oneself, a role one
 * holds, @everyone in effect) on `surface-3`; a channel as the same chip,
 * leading to it, the server named first when it is another one, or the
 * message link's "Can't view" chip that says so on a click. A token naming no one is words in
 * `text-secondary`, and @everyone without effect plain words (owner,
 * 14/11/2026). Not buttons: profiles come later (C-15).
 */
export function MentionChip({ part, mentions }: { part: MentionPart; mentions: ContentMentions }) {
    const { t } = useTranslation('messaging')
    const words = useMentionWords()
    const { names, me, roleIds } = mentions
    const name = mentionName(part, names, words)

    if (part.type === 'everyone') {
        return mentions.everyone ? <span className={cn(MENTION, MINE)}>{name}</span> : name
    }
    if (part.kind === 'channel') {
        const channel = names.channel(part.id)
        if (channel.kind === 'hidden') {
            return (
                <button
                    type='button'
                    onClick={() => toast(t('mention.hiddenChannelToast'))}
                    className={`${CHIP} text-text-secondary hover:bg-surface-3`}
                >
                    <Lock aria-hidden='true' />
                    {t('link.hidden')}
                </button>
            )
        }
        // Drawn as a person's chip is (frame `formatting`: `#tai-lieu` beside `@Bình`), and leads to the channel.
        return (
            <Link
                to={channel.to}
                className={cn(
                    MENTION,
                    THEIRS,
                    'transition-colors duration-micro hover:bg-surface-3 hover:text-text-primary'
                )}
            >
                {channel.server ? `${channel.server} › ` : ''}#{channel.name}
            </Link>
        )
    }
    const known =
        part.kind === 'user'
            ? names.users.some((user) => user.id === part.id)
            : names.roles.some((role) => role.id === part.id)
    if (!known) return <span className='text-text-secondary'>{name}</span>
    const mine = part.kind === 'user' ? part.id === me : roleIds.includes(part.id)
    return <span className={cn(MENTION, mine ? MINE : THEIRS)}>{name}</span>
}
