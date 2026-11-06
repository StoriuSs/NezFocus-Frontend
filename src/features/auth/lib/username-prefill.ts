import { USERNAME_MAX_LENGTH } from '@/features/users'

/**
 * The username "complete your account" starts with (S-ONB-01 › Tương tác):
 * the part of the email before `@`, lower case, without the characters a
 * username cannot have, cut at 32. Shorter than two characters, nothing.
 * Whether it is free is checked next; if taken, the field is left empty
 * rather than offering "an.nguyen2" (a username is for good, D-72).
 */
export function usernameFromEmail(email: string | undefined): string {
    if (!email) return ''
    const at = email.indexOf('@')
    const local = at < 0 ? email : email.slice(0, at)
    const name = local
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, '')
        .slice(0, USERNAME_MAX_LENGTH)
    return name.length >= 2 ? name : ''
}
