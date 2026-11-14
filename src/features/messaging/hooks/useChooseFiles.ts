import { useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { extensionOf, sortChosen } from '../lib/attachment-rules'

/** A name in a Toast: cut at 24 characters (S-CHAT-04 › chữ dài). */
const short = (name: string) => {
    const characters = [...name]
    return characters.length > 24 ? `${characters.slice(0, 24).join('')}…` : name
}

/**
 * Files chosen with (+) or pasted (S-CHAT-04): those that may go are added to
 * the tray, the first that fit in 10; the others never enter it, and a Toast
 * says why, one sentence for many (too big, of a type not sent, empty, over
 * 10). Without ATTACH_FILES nothing goes in.
 */
export function useChooseFiles(add: (files: File[]) => void, inTray: number, allowed: boolean) {
    const { t } = useTranslation('messaging')
    return useCallback(
        (files: File[]) => {
            if (!files.length) return
            if (!allowed) {
                toast.error(t('attach.notAllowed'))
                return
            }
            const sorted = sortChosen(files, inTray)
            const by = (why: string) => sorted.refused.filter((refusal) => refusal.why === why).map(({ file }) => file)
            const tooLarge = by('too-large')
            const unsupported = by('unsupported')
            const empty = by('empty')
            if (tooLarge.length)
                toast.error(
                    tooLarge.length === 1
                        ? t('attach.tooLargeOne', { name: short(tooLarge[0]!.name) })
                        : t('attach.tooLarge', { count: tooLarge.length })
                )
            if (unsupported.length) {
                const extension = extensionOf(unsupported[0]!.name)
                toast.error(
                    unsupported.length === 1 && extension
                        ? t('attach.unsupportedType', { extension })
                        : t('attach.unsupported', { count: unsupported.length })
                )
            }
            for (const file of empty) toast.error(t('attach.empty', { name: short(file.name) }))
            if (sorted.leftOut) toast.error(t('attach.tooMany', { count: sorted.leftOut }))
            if (sorted.taken.length) add(sorted.taken)
        },
        [add, inTray, allowed, t]
    )
}
