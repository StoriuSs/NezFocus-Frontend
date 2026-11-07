import { safeLocalStorage } from '@/lib/safe-storage'

/**
 * The two ways to sign in on S-AUTH-03 (D-60): an emailed one-time code,
 * the default, or the password.
 */
export type SignInMethod = 'code' | 'password'

const KEY = 'auth:sign-in-method'

/** The URL's name for the password way: `/login?method=password` (01-auth.md › S-AUTH-03). */
export const METHOD_PARAM = 'method'

/**
 * The way the last successful sign-in in this browser used, so the page opens
 * on it (D-68). The code when there is none, or storage is blocked.
 */
export function rememberedSignInMethod(): SignInMethod {
    return safeLocalStorage.get(KEY) === 'password' ? 'password' : 'code'
}

/** Called once a sign-in succeeds: by password, or by an emailed code. */
export function rememberSignInMethod(method: SignInMethod): void {
    safeLocalStorage.set(KEY, method)
}

/**
 * The way the page shows: what the URL says (a reload keeps it), else the
 * one remembered.
 */
export function signInMethodOf(search: URLSearchParams): SignInMethod {
    const named = search.get(METHOD_PARAM)
    if (named === 'password' || named === 'code') return named
    return rememberedSignInMethod()
}
