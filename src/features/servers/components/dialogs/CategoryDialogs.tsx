import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { WithTooltip } from '@/components/ui/tooltip'
import { generateIdempotencyKey } from '@/lib/idempotency'
import { createCategory, deleteCategory, renameCategory } from '../../api/layout.api'
import { rememberServer } from '../../api/useServers'
import { clashingChannel, groupChannels, MAX_CHANNELS_AND_CATEGORIES, storedName } from '../../lib/channel-layout'
import { layoutRule } from '../../lib/layout-error'
import type { Server, ServerCategory } from '../../types'
import { ChannelNameField } from './ChannelNameField'
import { describeFailure, nameError, type LayoutFailure } from './layout-errors'

const upper = (name: string) => name.toLocaleUpperCase('vi')

/**
 * The name form shared by "Create a category" (S-SRV-05 `category`) and
 * "Category settings" (S-SET-05 `category-edit`, which adds the delete row).
 */
function CategoryForm({
    server,
    category,
    onClose,
    onDelete
}: {
    server: Server
    /** Settings of this one; none: create. */
    category?: ServerCategory
    onClose: () => void
    onDelete?: () => void
}) {
    const { t } = useTranslation('servers')
    const queryClient = useQueryClient()
    const nameInput = useRef<HTMLInputElement>(null)
    const [name, setName] = useState(category?.name ?? '')
    const [fieldError, setFieldError] = useState<string | null>(null)
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)
    const [saving, setSaving] = useState(false)

    const creating = !category
    const atLimit = creating && server.categories.length + server.channels.length >= MAX_CHANNELS_AND_CATEGORIES
    const dirty = storedName('category', name) !== (category?.name ?? '')

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (saving || atLimit) return
        if (category && !dirty) return onClose()
        const problem = nameError(t, server, 'category', name, null, category?.id)
        if (problem) {
            setFieldError(problem)
            nameInput.current?.focus()
            return
        }
        setFailure(null)
        setSaving(true)
        try {
            const updated = category
                ? await renameCategory(server.id, category.id, name)
                : (await createCategory(server.id, name, generateIdempotencyKey())).server
            rememberServer(queryClient, updated)
            onClose()
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: 'category',
                categoryId: null,
                typed: name,
                creating
            })
            if (described.gone) {
                onClose()
                toast.error(t('layoutError.gone'))
            } else if (described.field) {
                setFieldError(described.field)
                nameInput.current?.focus()
            } else setFailure(described.form ?? null)
        } finally {
            setSaving(false)
        }
    }

    const submitButton = (
        <Button
            type='submit'
            disabled={saving}
            aria-disabled={atLimit || undefined}
            className={atLimit ? 'cursor-default bg-surface-3 text-text-tertiary hover:bg-surface-3' : undefined}
        >
            {saving ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
            {t(creating ? 'actions.createCategory' : 'actions.save')}
        </Button>
    )

    return (
        <DialogContent
            className='sm:max-w-dialog'
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
                event.preventDefault()
                nameInput.current?.focus()
            }}
            onInteractOutside={(event) => (dirty || saving) && event.preventDefault()}
            onEscapeKeyDown={(event) => saving && event.preventDefault()}
        >
            <form onSubmit={(event) => void submit(event)} className='space-y-5' noValidate>
                <DialogHeader>
                    <DialogTitle>{t(creating ? 'category.createTitle' : 'category.settingsTitle')}</DialogTitle>
                </DialogHeader>
                {atLimit ? <FormMessage tone='neutral'>{t('layoutError.limit')}</FormMessage> : null}
                <ChannelNameField
                    kind='category'
                    value={name}
                    onChange={(next) => {
                        setName(next)
                        setFieldError(null)
                    }}
                    error={fieldError}
                    readOnly={saving}
                    inputRef={nameInput}
                />
                {onDelete ? (
                    <div className='border-t pt-4'>
                        <Button
                            type='button'
                            variant='text'
                            size='sm'
                            className='text-danger'
                            disabled={saving}
                            onClick={onDelete}
                        >
                            <Trash2 aria-hidden='true' />
                            {t('category.delete')}
                        </Button>
                    </div>
                ) : null}
                {failure ? (
                    <FormMessage tone={failure.tone} icon={failure.icon}>
                        {failure.text}
                    </FormMessage>
                ) : null}
                <DialogFooter>
                    <Button type='button' variant='text' disabled={saving} onClick={onClose}>
                        {t('actions.cancel')}
                    </Button>
                    {atLimit ? <WithTooltip label={t('layoutError.limit')}>{submitButton}</WithTooltip> : submitButton}
                </DialogFooter>
            </form>
        </DialogContent>
    )
}

/** "Create a category" (S-SRV-05 `category`): it joins the end of the list. */
export function CreateCategoryDialog({ server, onClose }: { server: Server; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <CategoryForm server={server} onClose={onClose} />
        </Dialog>
    )
}

/** "Category settings" (S-SET-05 `category-edit`), with "Delete category" over it. */
export function CategorySettingsDialog({
    server,
    category,
    onClose
}: {
    server: Server
    category: ServerCategory
    onClose: () => void
}) {
    const [deleting, setDeleting] = useState(false)
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <CategoryForm server={server} category={category} onClose={onClose} onDelete={() => setDeleting(true)} />
            {deleting ? (
                <DeleteCategoryDialog
                    server={server}
                    category={category}
                    onCancel={() => setDeleting(false)}
                    onDeleted={onClose}
                />
            ) : null}
        </Dialog>
    )
}

/**
 * "Delete the category THÔNG TIN?" (S-SET-05 `category-delete-confirm`):
 * its channels move to the top of the list. When one would clash there with
 * a channel of its kind (D-84), it says which, and the button stays off.
 */
function DeleteCategoryDialog({
    server,
    category,
    onCancel,
    onDeleted
}: {
    server: Server
    category: ServerCategory
    onCancel: () => void
    onDeleted: () => void
}) {
    const { t } = useTranslation('servers')
    const queryClient = useQueryClient()
    const [deleting, setDeleting] = useState(false)
    const [refused, setRefused] = useState<string[] | null>(null)
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)

    const channels = groupChannels(server, category.id)
    const clashes = channels.filter((c) => clashingChannel(server, null, c.type, c.name, c.id)).map((c) => c.name)
    const blocked = refused ?? (clashes.length > 0 ? clashes : null)

    async function confirm() {
        setDeleting(true)
        setFailure(null)
        try {
            rememberServer(queryClient, await deleteCategory(server.id, category.id))
            onDeleted()
            toast.success(t('category.deleted', { name: upper(category.name) }))
        } catch (error) {
            const broken = layoutRule(error)
            if (broken?.rule === 'name_taken') setRefused(broken.names)
            else {
                const described = describeFailure(t, error, {
                    server,
                    kind: 'category',
                    categoryId: null,
                    typed: category.name,
                    creating: false
                })
                if (described.gone) {
                    onDeleted()
                    toast.error(t('layoutError.gone'))
                } else setFailure(described.form ?? null)
            }
        } finally {
            setDeleting(false)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !deleting && onCancel()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t('category.deleteTitle', { name: upper(category.name) })}</DialogTitle>
                    <DialogDescription>
                        {channels.length > 0
                            ? t('category.deleteBody', { count: channels.length })
                            : t('category.deleteEmpty')}
                    </DialogDescription>
                </DialogHeader>
                {blocked ? (
                    <FormMessage tone='danger'>
                        {t('category.deleteBlocked', { names: blocked.map((name) => `#${name}`).join(', ') })}
                    </FormMessage>
                ) : null}
                {failure ? (
                    <FormMessage tone={failure.tone} icon={failure.icon}>
                        {failure.text}
                    </FormMessage>
                ) : null}
                <DialogFooter>
                    <Button type='button' variant='text' disabled={deleting} onClick={onCancel}>
                        {t('actions.cancel')}
                    </Button>
                    <Button
                        type='button'
                        variant='destructive'
                        disabled={deleting || blocked !== null}
                        onClick={() => void confirm()}
                    >
                        {deleting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('category.delete')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
