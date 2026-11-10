import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useCreateRole } from '../../../api/useRoles'
import type { Role, Server } from '../../../types'
import { checkRoleName, nameProblemOf, RoleNameField, type RoleNameProblem } from './RoleNameField'

/**
 * "Create role" (S-SET-02 `create-role`, Dialog `form` 440): a name, then the
 * new role's page opens on its permissions (D-87: no permission, right
 * below one's highest role).
 */
export function CreateRoleDialog({
    server,
    roles,
    onClose,
    onCreated
}: {
    server: Server
    roles: Role[]
    onClose: () => void
    onCreated: (roleId: string) => void
}) {
    const { t } = useTranslation('servers')
    const create = useCreateRole(server.id)
    const input = useRef<HTMLInputElement>(null)
    const [name, setName] = useState('')
    const [problem, setProblem] = useState<RoleNameProblem | null>(null)
    useEffect(() => input.current?.focus(), [])

    function submit(event: FormEvent) {
        event.preventDefault()
        if (create.isPending) return
        const found = checkRoleName(name, roles)
        if (found) {
            setProblem(found)
            return input.current?.focus()
        }
        create.mutate(name.normalize('NFC').trim(), {
            onSuccess: onCreated,
            onError: (error) => {
                const refused = nameProblemOf(error)
                if (refused) {
                    setProblem(refused)
                    input.current?.focus()
                } else toast.error(t('roles.saveFailed'))
            }
        })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
            <DialogContent className='sm:max-w-dialog' onOpenAutoFocus={(event) => event.preventDefault()}>
                <form onSubmit={submit} className='grid gap-4' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t('roles.createDialog.title')}</DialogTitle>
                        <DialogDescription>{t('roles.createDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <RoleNameField
                        ref={input}
                        value={name}
                        roles={roles}
                        problem={problem}
                        readOnly={create.isPending}
                        onChange={(value) => {
                            setName(value)
                            setProblem(null)
                        }}
                    />
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={create.isPending} onClick={onClose}>
                            {t('roles.createDialog.cancel')}
                        </Button>
                        <Button type='submit' disabled={create.isPending}>
                            {create.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t('roles.createDialog.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
