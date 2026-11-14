import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import type { MentionWords } from '../lib/mentions'

/** What a mention naming no one reads as, in the reader's language (owner, 14/11/2026). */
export function useMentionWords(): MentionWords {
    const { t } = useTranslation('messaging')
    return useMemo(
        () => ({
            deletedAccount: t('message.deletedAccount'),
            unknownUser: t('mention.unknownUser'),
            unknownRole: t('mention.unknownRole'),
            hiddenChannel: t('mention.hiddenChannel')
        }),
        [t]
    )
}
