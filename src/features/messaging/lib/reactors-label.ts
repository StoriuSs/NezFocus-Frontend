import type { TFunction } from 'i18next'
import '@/i18n/messaging'
import type { Reactors } from '../types'

/**
 * The chip's Tooltip (C-10 ReactionChip, SRS 1.71): "Bình, Chi, Dũng and 5
 * others reacted with 👍", the first three people to give it, the person
 * reading as "You". Before they are read, only how many: "8 people reacted
 * with 👍". Names joined as the language joins a list ("A, B and C",
 * "A, B, and C").
 */
export function reactorsLabel(
    reactors: Reactors | undefined,
    emoji: string,
    count: number,
    me: string | undefined,
    t: TFunction<'messaging'>
): string {
    if (!reactors?.users.length) return t('reactions.count', { count, emoji })
    const names = reactors.users.map((user) =>
        user.id === me ? t('reactions.you') : (user.displayName ?? user.username ?? t('message.deletedAccount'))
    )
    const others = Math.max(reactors.count - reactors.users.length, 0)
    if (others) names.push(t('reactions.others', { count: others }))
    const last = names.pop()!
    const joined = !names.length
        ? last
        : names.length === 1
          ? t('reactions.listTwo', { first: names[0], last })
          : t('reactions.listMany', { head: names.join(', '), last })
    return t('reactions.by', { names: joined, emoji })
}
