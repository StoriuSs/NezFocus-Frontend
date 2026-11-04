/**
 * The password just typed for an unconfirmed address, kept for the confirm
 * page: the API asks for it with the code (the API starter's
 * docs/auth/accounts.md, "Confirming the address"), and typing it again
 * straight after choosing it would be a chore.
 *
 * Held in this module's memory only: never in storage, the URL or the
 * history entry, where it would outlive the tab. A reload forgets it, and the
 * confirm page then asks for the password.
 *
 * Set by sign-up (the password just chosen) and by sign-in when it learns the
 * address is not confirmed yet (the password was right).
 */
let held: { email: string; password: string } | null = null

const normalise = (email: string) => email.trim().toLowerCase()

export function holdSignUpPassword(email: string, password: string): void {
    held = { email: normalise(email), password }
}

/** The password held for this address, if any. */
export function heldSignUpPassword(email: string | undefined): string | undefined {
    return email && held?.email === normalise(email) ? held.password : undefined
}

/** Once the address is confirmed: nothing needs it any more. */
export function forgetSignUpPassword(): void {
    held = null
}
