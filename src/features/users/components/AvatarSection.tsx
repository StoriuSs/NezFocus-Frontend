import { useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { OctagonX } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAvatarErrorRefresh } from '@/features/users/hooks/useAvatarErrorRefresh'
import { removeAvatarWithUndo } from '@/features/users/lib/avatar-removal'
import type { UserProfile } from '@/features/users/types'
import { IMAGE_TYPES, imageProblem, type ImageProblem } from '@/lib/image-file'
import { AvatarCropDialog } from './AvatarCropDialog'

/**
 * The picture part of S-ME-02: the avatar (a button, and a place to drop an
 * image), "Change photo", "Remove photo" when there is one, and the line
 * under them: the accepted files, or why the chosen one was refused
 * (`upload-error`). A picture is saved on its own, from the crop dialog,
 * not with the save bar (Q4).
 */
export function AvatarSection({ profile }: { profile: UserProfile }) {
    const { t } = useTranslation('users')
    const queryClient = useQueryClient()
    const fileInput = useRef<HTMLInputElement>(null)
    const changeButton = useRef<HTMLButtonElement>(null)
    const [problem, setProblem] = useState<ImageProblem | null>(null)
    const [chosen, setChosen] = useState<string | null>(null)
    const refreshAvatar = useAvatarErrorRefresh(profile.avatarUrl)
    const name = profile.displayName || profile.username || ''

    function choose(file: File | undefined) {
        if (!file) return
        const refused = imageProblem(file)
        setProblem(refused)
        if (!refused) setChosen(URL.createObjectURL(file))
    }

    function drop(event: DragEvent) {
        event.preventDefault()
        choose(event.dataTransfer.files[0])
    }

    const remove = () =>
        removeAvatarWithUndo(queryClient, { removed: t('toasts.avatarRemoved'), undo: t('toasts.undo') })

    return (
        <div className='flex items-center gap-6'>
            {/* For the mouse and a dropped file; the keyboard has the buttons beside it. */}
            <button
                type='button'
                aria-label={t('profile.avatar.label')}
                tabIndex={-1}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
                onDrop={drop}
                className='rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
            >
                <Avatar className='size-24'>
                    <AvatarImage
                        src={profile.avatarUrl ?? undefined}
                        alt=''
                        className='object-cover'
                        onLoadingStatusChange={(status) => status === 'error' && refreshAvatar()}
                    />
                    <AvatarFallback className='bg-primary text-title-1 text-on-primary'>
                        {name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            </button>
            <div className='grid gap-2'>
                <div className='flex gap-2'>
                    <Button
                        ref={changeButton}
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => fileInput.current?.click()}
                    >
                        {t('profile.avatar.change')}
                    </Button>
                    {profile.avatarUrl ? (
                        <Button type='button' variant='text' size='sm' onClick={remove}>
                            {t('profile.avatar.remove')}
                        </Button>
                    ) : null}
                </div>
                {problem ? (
                    <p className='flex gap-1.5 text-label text-danger' role='alert'>
                        <OctagonX className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                        {t(`profile.avatar.${problem}`)}
                    </p>
                ) : (
                    <p className='text-label text-text-tertiary'>{t('profile.avatar.hint')}</p>
                )}
            </div>
            <input
                ref={fileInput}
                type='file'
                accept={IMAGE_TYPES.join(',')}
                className='hidden'
                aria-hidden='true'
                tabIndex={-1}
                onChange={(event) => {
                    choose(event.target.files?.[0])
                    // The same file chosen again is a change too.
                    event.target.value = ''
                }}
            />
            {chosen ? (
                <AvatarCropDialog
                    key={chosen}
                    src={chosen}
                    returnFocus={changeButton}
                    onClose={() => {
                        // An object URL pins the file in memory until released.
                        URL.revokeObjectURL(chosen)
                        setChosen(null)
                    }}
                />
            ) : null}
        </div>
    )
}
