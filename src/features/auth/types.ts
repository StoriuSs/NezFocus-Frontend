import type { ApiModel } from '@/lib/api-types'

/** An access token, from sign-in, refresh or a reset. */
export type TokenResponse = ApiModel<'TokenResponseDto'>
/** Signing in with the emailed code: the tokens, and what the page needs to know about the account. */
export type EmailCodeSignIn = ApiModel<'EmailCodeSignInResponseDto'>
/** The "complete your account" form, as POST /auth/complete-account takes it. */
export type AccountCompletion = ApiModel<'CompleteAccountRequestDto'>
export type AuthOptions = ApiModel<'AuthOptionsResponseDto'>
