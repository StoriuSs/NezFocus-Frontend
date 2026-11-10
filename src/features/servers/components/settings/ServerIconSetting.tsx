import '@/i18n/servers'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OctagonX } from 'lucide-react'
import { ImageCropDialog } from '@/components/ImageCropDialog'
import { Button } from '@/components/ui/button'
import { IMAGE_TYPES, imageProblem, type ImageProblem } from '@/lib/image-file'
import { useRemoveServerIcon, useUploadServerIcon } from '../../api/useServerSettings'
import type { Server } from '../../types'
import { ServerIcon } from '../ServerIcon'

/**
 * "Server picture" on Overview (S-SET-01): the picture at 80 (initials
 * without one), "Change picture" ("Upload picture" without one) and "Remove
 * picture". Saved on its own, not with the save bar: a picture is uploaded
 * from the crop dialog, which waits while it does (as the avatar, S-ME-02);
 * removing is at once, without asking, since another can be uploaded.
 */
export function ServerIconSetting({ server }: { server: Server }) {
    const { t } = useTranslation('servers')
    const fileInput = useRef<HTMLInputElement>(null)
    const [problem, setProblem] = useState<ImageProblem | null>(null)
    const [chosen, setChosen] = useState<string | null>(null)
    const upload = useUploadServerIcon(server.id)
    const remove = useRemoveServerIcon(server.id)

    function choose(file: File | undefined) {
        if (!file) return
        const refused = imageProblem(file)
        setProblem(refused)
        if (!refused) setChosen(URL.createObjectURL(file))
    }

    function closeCrop() {
        // An object URL pins the file in memory until released.
        if (chosen) URL.revokeObjectURL(chosen)
        setChosen(null)
    }

    const pick = () => fileInput.current?.click()

    return (
        <div className='flex items-center gap-6'>
            <button
                type='button'
                aria-label={t('settings.overview.icon.pick')}
                onClick={pick}
                className='rounded-[33%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
            >
                <ServerIcon
                    name={server.name}
                    iconUrl={server.iconUrl}
                    className='size-20 rounded-[33%] text-title-2'
                />
            </button>
            <div className='grid gap-2'>
                <p className='text-body-sm text-text-primary'>{t('settings.overview.icon.label')}</p>
                {problem ? (
                    <p className='flex gap-1.5 text-label text-danger' role='alert'>
                        <OctagonX className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                        {t(`create.icon.${problem}`)}
                    </p>
                ) : (
                    <p className='text-label text-text-tertiary'>{t('settings.overview.icon.hint')}</p>
                )}
                <div className='flex gap-2'>
                    <Button type='button' variant='outline' size='sm' onClick={pick}>
                        {server.iconUrl ? t('settings.overview.icon.change') : t('settings.overview.icon.upload')}
                    </Button>
                    {server.iconUrl ? (
                        <Button
                            type='button'
                            variant='text'
                            size='sm'
                            disabled={remove.isPending}
                            onClick={() => remove.mutate()}
                        >
                            {t('settings.overview.icon.remove')}
                        </Button>
                    ) : null}
                </div>
            </div>
            <input
                ref={fileInput}
                type='file'
                accept={IMAGE_TYPES.join(',')}
                className='hidden'
                aria-hidden='true'
                tabIndex={-1}
                data-testid='server-icon-file'
                onChange={(event) => {
                    choose(event.target.files?.[0])
                    // The same file chosen again is a change too.
                    event.target.value = ''
                }}
            />
            {chosen ? (
                <ImageCropDialog
                    key={chosen}
                    src={chosen}
                    mask='squircle'
                    title={t('crop.title')}
                    description={t('crop.description')}
                    confirmLabel={t('crop.confirm')}
                    busy={upload.isPending}
                    onConfirm={(blob) => upload.mutate(blob, { onSuccess: closeCrop })}
                    onClose={closeCrop}
                />
            ) : null}
        </div>
    )
}
