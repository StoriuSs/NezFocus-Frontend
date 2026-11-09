/**
 * The permission bits of SRS appendix B, by name. The backend works out who
 * may do what (D-145); the interface only reads the bits it sends, to show or
 * hide what someone may not do. The backend still refuses on its own.
 */
const BITS = {
    ADMINISTRATOR: 0,
    MANAGE_SERVER: 1,
    MANAGE_ROLES: 2,
    MANAGE_CHANNELS: 3,
    KICK_MEMBERS: 4,
    BAN_MEMBERS: 5,
    MODERATE_MEMBERS: 6,
    CREATE_INVITE: 7,
    VIEW_CHANNEL: 8,
    SEND_MESSAGES: 10,
    ATTACH_FILES: 11,
    ADD_REACTIONS: 12,
    MENTION_EVERYONE: 13,
    MANAGE_MESSAGES: 14,
    CONNECT: 15,
    SPEAK: 16,
    VIDEO: 17,
    MUTE_MEMBERS: 18,
    MOVE_MEMBERS: 19,
    MANAGE_STUDY_ROOMS: 20,
    CREATE_TASKS: 21,
    MANAGE_TASKS: 22
} as const

export type PermissionName = keyof typeof BITS

/** Whether `bits` (a decimal string from the API) grants `permission`. Anything unreadable grants nothing. */
export function can(bits: string, permission: PermissionName): boolean {
    if (!/^\d{1,20}$/.test(bits)) return false
    return ((BigInt(bits) >> BigInt(BITS[permission])) & 1n) === 1n
}
