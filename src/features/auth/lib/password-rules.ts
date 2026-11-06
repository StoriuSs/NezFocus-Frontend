/**
 * The password rules, as the API applies them (NezFocus-Backend
 * src/modules/auth/domain/password-policy.ts; SRS REQ-AUTH-01, D-29, D-66),
 * so a form can tick them off while someone types instead of after a round
 * trip.
 *
 * Every rule is checked here; `matches_username` only when the form knows the
 * username. The API stays the judge: a refusal names the rules it broke in
 * `data.rules`, which the forms show the same way.
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

/** The conditions PasswordRules shows as a grid while typing, in order (C-22). */
export const GRID_RULES = ['min_length', 'uppercase', 'lowercase', 'digit', 'special'] as const

/** Rules shown as an error of the password field instead of in the grid (C-22, D-66), most important first. */
export const FIELD_RULES = ['max_length', 'matches_email', 'matches_username'] as const

export interface PasswordContext {
    email?: string | null
    username?: string | null
}

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
 * `ada@example.test`. Containing it is fine, as on the API (D-66).
 */
function isIdentity(password: string, identity: string): boolean {
    if (password.toLowerCase() === identity) return true
    const letters = identityLetters(identity)
    return letters.length >= MIN_IDENTITY_LETTERS && identityLetters(password) === letters
}

/** Every rule the password breaks. Same order and meaning as the API's. */
export function brokenPasswordRules(password: string, context: PasswordContext = {}): PasswordRule[] {
    const broken: PasswordRule[] = []
    const characters = [...password]

    if (characters.length < PASSWORD_MIN_LENGTH) broken.push('min_length')
    if (characters.length > PASSWORD_MAX_LENGTH) broken.push('max_length')
    if (!/\p{Ll}/u.test(password)) broken.push('lowercase')
    if (!/\p{Lu}/u.test(password)) broken.push('uppercase')
    if (!/\p{Nd}/u.test(password)) broken.push('digit')
    if (!/[^\p{L}\p{Nd}]/u.test(password)) broken.push('special')

    const address = context.email?.trim().toLowerCase()
    if (address && (isIdentity(password, address) || isIdentity(password, address.split('@')[0] ?? ''))) {
        broken.push('matches_email')
    }
    const username = context.username?.trim().toLowerCase()
    if (username && isIdentity(password, username)) broken.push('matches_username')

    return broken
}

/** The rule to show as the field's error, if any of `rules` is one. */
export function passwordFieldRule(rules: readonly PasswordRule[]): PasswordRule | undefined {
    return FIELD_RULES.find((rule) => rules.includes(rule))
}

const KNOWN_RULES = new Set<string>([...GRID_RULES, ...FIELD_RULES])

/** The rules an `AUTH_PASSWORD_REJECTED` answer names, keeping only ones this app knows. */
export function rejectedRules(value: unknown): PasswordRule[] {
    if (!Array.isArray(value)) return []
    return value.filter((rule): rule is PasswordRule => typeof rule === 'string' && KNOWN_RULES.has(rule))
}
