import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useBlockPerson, useRemoveRelationship } from '../api/useRelationshipActions'

/** Which question: remove a friend, or block someone. */
export type ConfirmKind = 'unfriend' | 'block'

/**
 * "Hủy kết bạn với {Bình}?" / "Chặn {Bình}?" (S-DM-02 `unfriend-confirm`,
 * `block-confirm`, C-14 `simple`): the focus on the way out ("Giữ lại",
 * never "Hủy" beside "Hủy kết bạn"; "Hủy" for a block), the action
 * `danger`. Done, it closes with no Toast: the row leaving says it. A
 * failure is the query client's Toast; the dialog stays.
 */
export function ConfirmRelationshipDialog({
    kind,
    userId,
    name,
    onClose
}: {
    kind: ConfirmKind
    userId: string
    name: string
    onClose: () => void
}) {
    const { t } = useTranslation('social')
    const unfriend = useRemoveRelationship()
    const block = useBlockPerson()
    const [busy, setBusy] = useState(false)
    const keep = useRef<HTMLButtonElement>(null)
    const words =
        kind === 'unfriend'
            ? {
                  title: t('unfriend.title', { name }),
                  body: t('unfriend.body', { name }),
                  keep: t('unfriend.keep'),
                  confirm: t('unfriend.confirm')
              }
            : {
                  title: t('block.title', { name }),
                  body: t('block.body', { name }),
                  keep: t('block.cancel'),
                  confirm: t('block.confirm')
              }

    const confirm = async () => {
        setBusy(true)
        try {
            await (kind === 'unfriend' ? unfriend : block).mutateAsync(userId)
            onClose()
        } catch {
            setBusy(false)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
            <DialogContent
                className='sm:max-w-dialog'
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    keep.current?.focus()
                }}
            >
                <DialogHeader>
                    <DialogTitle className='break-words'>{words.title}</DialogTitle>
                    <DialogDescription>{words.body}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button ref={keep} type='button' variant='text' disabled={busy} onClick={onClose}>
                        {words.keep}
                    </Button>
                    <Button type='button' variant='destructive' disabled={busy} onClick={() => void confirm()}>
                        {busy ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {words.confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
