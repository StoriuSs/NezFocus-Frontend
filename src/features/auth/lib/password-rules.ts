/**
 * The password rules, as the API applies them (the backend's
 * src/modules/auth/domain/password-policy.ts), so a form can tick them off
 * while someone types instead of after a round trip.
 *
 * The API stays the judge. Two rules only it checks: `common` (its list of
 * common passwords is 8,500 words, too big to ship to every visitor) and
 * `matches_username` (a new account has no username yet). A refusal names
 * the rules it broke in `data.rules`, which the forms show the same way.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export type PasswordRule =
    | 'min_length'
    | 'max_length'
    | 'lowercase'
    | 'uppercase'
    | 'digit'
    | 'special'
    | 'matches_email'
    | 'matches_username'
    | 'common'

/** The rules shown as a checklist while typing, in order. */
export const CHECKLIST_RULES = ['min_length', 'lowercase', 'uppercase', 'digit', 'special'] as const

const LEET: Record<string, string> = {
    '@': 'a',
    '4': 'a',
    '3': 'e',
    '1': 'i',
    '!': 'i',
    '0': 'o',
    $: 's',
    '5': 's',
    '7': 't'
}

/** The API's baseWord(): lower case, digits and symbols trimmed from both ends, swaps like `0 → o` undone. */
function baseWord(value: string): string {
    const trimmed = value.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '')
    return [...trimmed].map((char) => LEET[char] ?? char).join('')
}

const identityLetters = (value: string) => baseWord(value).replace(/[^a-z]/g, '')

const MIN_IDENTITY_LETTERS = 3

/**
 * Whether the password *is* the identity, dressed up: `Ada2026!` for
 * `ada@example.test`. Containing it is fine, as on the API.
 */
function isIdentity(password: string, identity: string): boolean {
    if (password.toLowerCase() === identity) return true
    const letters = identityLetters(identity)
    return letters.length >= MIN_IDENTITY_LETTERS && identityLetters(password) === letters
}

/** Every rule the browser can check that the password breaks. Same order and meaning as the API's. */
export function brokenPasswordRules(password: string, email?: string): PasswordRule[] {
    const broken: PasswordRule[] = []
    const characters = [...password]

    if (characters.length < PASSWORD_MIN_LENGTH) broken.push('min_length')
    if (characters.length > PASSWORD_MAX_LENGTH) broken.push('max_length')
    if (!/\p{Ll}/u.test(password)) broken.push('lowercase')
    if (!/\p{Lu}/u.test(password)) broken.push('uppercase')
    if (!/\p{Nd}/u.test(password)) broken.push('digit')
    if (!/[^\p{L}\p{Nd}]/u.test(password)) broken.push('special')

    const address = email?.trim().toLowerCase()
    if (address && (isIdentity(password, address) || isIdentity(password, address.split('@')[0] ?? ''))) {
        broken.push('matches_email')
    }
    return broken
}

const KNOWN_RULES = new Set<string>([
    'min_length',
    'max_length',
    'lowercase',
    'uppercase',
    'digit',
    'special',
    'matches_email',
    'matches_username',
    'common'
])

/** The rules an `AUTH_PASSWORD_REJECTED` answer names, keeping only ones this app knows. */
export function rejectedRules(value: unknown): PasswordRule[] {
    if (!Array.isArray(value)) return []
    return value.filter((rule): rule is PasswordRule => typeof rule === 'string' && KNOWN_RULES.has(rule))
}
