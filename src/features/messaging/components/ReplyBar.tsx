import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { IconButton } from '@/components/ui/icon-button'
import type { RepliedMessage } from '../types'

/**
 * "Replying to **Tuấn**" ✕ over the composer (C-12 `reply`, S-CHAT-01
 * `reply-mode`): 32 high on `surface-2`, padding 12 / 8, ✕ 24 with an icon
 * 14. Once the message is deleted meanwhile, it says so; the reply still
 * sends. `id` describes the composer's box, so a screen reader says whom
 * one answers.
 */
export function ReplyBar({ id, quoted, onCancel }: { id: string; quoted: RepliedMessage; onCancel: () => void }) {
    const { t } = useTranslation('messaging')
    const name = quoted.author?.displayName ?? quoted.author?.username ?? t('message.deletedAccount')
    return (
        <div className='flex h-8 items-center justify-between gap-1.5 rounded-t-input bg-surface-2 pl-3 pr-2 text-label text-text-secondary'>
            <p id={id} className='truncate'>
                {quoted.deleted ? (
                    t('message.replyDeleted')
                ) : (
                    <>
                        {t('reply.replying')} <strong className='font-semibold text-text-primary'>{name}</strong>
                    </>
                )}
            </p>
            <IconButton
                label={t('reply.cancel')}
                className='size-6 hover:bg-surface-3 [&_svg]:size-3.5'
                onClick={onCancel}
            >
                <X aria-hidden='true' />
            </IconButton>
        </div>
    )
}
