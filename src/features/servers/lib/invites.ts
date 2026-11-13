import type { Invite, InviteSettings } from '../types'
import { invitePath } from './paths'

/** What the API takes as a code (REQ-SRV-03). */
export const INVITE_CODE = /^[A-Za-z0-9]{8,10}$/

/** The lifetimes offered (S-SRV-02 › edit-settings): 30 minutes, 1 hour, 1 day, 7 days (the default), never. */
export const INVITE_MAX_AGES = [1800, 3600, 86400, 604800, null] as const

export type InviteMaxAge = (typeof INVITE_MAX_AGES)[number]

/** The use limits offered (as the app's list); null: no limit, the default. */
export const INVITE_MAX_USES = [null, 1, 5, 10, 25, 50, 100] as const

export const DEFAULT_INVITE_SETTINGS: InviteSettings = { maxAgeSeconds: 604800, maxUses: null }

/**
 * A code, and the link's `?channel=`, from what was pasted into "Join with
 * an invite code" (S-SRV-01): the code alone, or a whole link with or without
 * `https://`. Null when neither.
 */
export function parseInviteInput(text: string): { code: string; channel: string | null } | null {
    const value = text.trim()
    if (INVITE_CODE.test(value)) return { code: value, channel: null }
    const match = /(?:^|\/)invite\/([^/?#\s]+)(\?[^#\s]*)?/.exec(value)
    const code = match?.[1]
    if (!code || !INVITE_CODE.test(code)) return null
    return { code, channel: new URLSearchParams(match?.[2] ?? '').get('channel') }
}

/** The link to send: /invite/{code}, with `?channel=` for a room or a channel (D-150). */
export function inviteLink(code: string, channel?: string | null): string {
    const url = new URL(invitePath(code), window.location.origin)
    if (channel) url.searchParams.set('channel', channel)
    return url.toString()
}

/** A link as shown, without `https://` (03 › Quy ước: Mã mời). */
export const shownLink = (link: string) => link.replace(/^https?:\/\//, '')

/** How long until a link expires, in the largest whole unit, rounded up (Q15: "7 days", "23 hours", "25 minutes"). */
export function timeLeft(expiresAt: string, now: Date): { unit: 'days' | 'hours' | 'minutes'; count: number } {
    // Whole minutes first: a 1-day link made a moment ago reads "1 day", not "24 hours".
    const minutes = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000))
    if (minutes < 60) return { unit: 'minutes', count: minutes }
    // Rounded up, 23 h 55 min is 24 hours: that reads as "1 day".
    const hours = Math.ceil(minutes / 60)
    if (hours < 24) return { unit: 'hours', count: hours }
    return { unit: 'days', count: Math.ceil(minutes / (24 * 60)) }
}

/** Uses on the settings line (Q15): "no limit", "up to 10" while unused, then "7 left". */
export function usesLeft(invite: Pick<Invite, 'maxUses' | 'uses'>): {
    kind: 'unlimited' | 'max' | 'left'
    count: number
} {
    if (invite.maxUses === null || invite.maxUses === undefined) return { kind: 'unlimited', count: 0 }
    if (invite.uses === 0) return { kind: 'max', count: invite.maxUses }
    return { kind: 'left', count: invite.maxUses - invite.uses }
}

/** Whether a link already has these settings: then "Create a new link" would hand the same one back (D-151). */
export function sameSettings(invite: Invite, settings: InviteSettings): boolean {
    return (
        settings.maxUses === null &&
        invite.maxUses === null &&
        (invite.maxAgeSeconds ?? null) === settings.maxAgeSeconds
    )
}
