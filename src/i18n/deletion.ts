import i18n from '@/i18n'
import en from './locales/en/deletion.json'
import vi from './locales/vi/deletion.json'

/**
 * The words of deleting an account and restoring it (REQ-AUTH-09, D-141):
 * the "Delete account" group and dialog, the sign-in page's banner and the
 * restore dialog. Their own namespace, `deletion`, added by the chunks that
 * show them (the account page, the sign-in page, the restore dialog), so
 * they stay out of the first download (code-splitting.md). Adding twice is
 * harmless.
 */
export const deletionResources = { en, vi } as const

i18n.addResourceBundle('en', 'deletion', en, true, true)
i18n.addResourceBundle('vi', 'deletion', vi, true, true)
