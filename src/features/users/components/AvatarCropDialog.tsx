import { useTranslation } from 'react-i18next'
import { ImageCropDialog } from '@/components/ImageCropDialog'
import { useUpdateAvatar } from '@/features/users/api/useUpdateAvatar'

/**
 * "Crop your profile picture" (S-ME-02 `avatar-crop`, Q6): the shared crop
 * dialog with a round mask. "Save photo" uploads at once; while it does, the
 * dialog stays (Esc and Cancel wait, `avatar-uploading`). Saved, it closes.
 * A refusal is toasted by the query client; the dialog stays to try again.
 *
 * `src` is an object URL of the chosen file, the caller's to release.
 */
export function AvatarCropDialog({ src, onClose }: { src: string; onClose: () => void }) {
    const { t } = useTranslation('users')
    const upload = useUpdateAvatar()

    return (
        <ImageCropDialog
            src={src}
            mask='round'
            title={t('crop.title')}
            description={t('crop.description')}
            confirmLabel={t('crop.save')}
            busy={upload.isPending}
            onConfirm={(blob) => upload.mutate(blob, { onSuccess: onClose })}
            onClose={onClose}
        />
    )
}
