import type { SendBlock } from '../types'

/** The line of each reason but a timeout (C-12 `disabled`): the composer's, and the drop zone's (`drop-blocked`). */
export const LOCK_WORDS = {
    'managers-only': 'composer.disabled.managersOnly',
    'no-permission': 'composer.disabled.noPermission',
    'cannot-message': 'composer.disabled.cannotMessage',
    'deleted-account': 'composer.disabled.deletedAccount'
} as const satisfies Record<Exclude<SendBlock['reason'], 'timed-out'>, string>
