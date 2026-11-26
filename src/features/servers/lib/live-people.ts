import type { TFunction } from 'i18next'
import '@/i18n/study'
import { nameOf } from '@/features/social'
import type { LiveRoom } from './live-rooms'

/**
 * A row's people (C-44 › Dòng người, D-254): up to two friends named, the
 * first to have joined, then how many others ("Bình, Chi và 6 người"); the
 * names alone when no one else is there; "{N} người" with no friend in it;
 * "Chỉ có bạn" alone in it. The server's name follows, the row's own.
 */
export function livePeopleText(t: TFunction<'study'>, room: LiveRoom): string {
    const [a, b] = room.friends.slice(0, 2).map((user) => nameOf(user) ?? '')
    const count = room.people - (a === undefined ? 0 : b === undefined ? 1 : 2)
    if (b !== undefined && a !== undefined)
        return count > 0 ? t('overview.rooms.twoFriends', { a, b, count }) : t('overview.rooms.friendPair', { a, b })
    if (a !== undefined) return count > 0 ? t('overview.rooms.oneFriend', { a, count }) : a
    return count > 0 ? t('overview.rooms.people', { count }) : t('overview.rooms.alone')
}
