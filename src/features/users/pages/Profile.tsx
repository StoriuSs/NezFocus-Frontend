import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, Pencil, Camera } from 'lucide-react'
import Cropper, { Point, Area } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import getCroppedImg from '@/features/users/lib/crop-image'
import { ProfileSkeleton } from '@/features/users/components/ProfileSkeleton'
import { ShellPage } from '@/components/shell/ShellPage'
import { useProfile } from '@/features/users/api/useProfile'
import { useUpdateProfile } from '@/features/users/api/useUpdateProfile'
import { useUpdateAvatar } from '@/features/users/api/useUpdateAvatar'
import { DeleteAccountDialog } from '@/features/auth'
import { useAvatarErrorRefresh } from '@/features/users/hooks/useAvatarErrorRefresh'
import type { TFunction } from 'i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Slider } from '@/components/ui/slider'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'

/**
 * The same limits the API enforces (UpdateProfileRequestDto), so a value the
 * form accepts is never rejected on save; messages come from the catalogue.
 */
const createProfileSchema = (t: TFunction<'users'>) =>
    z.object({
        displayName: z
            .string()
            .trim()
            .min(1, t('validation.displayNameRequired'))
            .max(100, t('validation.displayNameTooLong')),
        bio: z.string().trim().max(500, t('validation.bioTooLong')).optional()
    })

type ProfileFormValues = z.infer<ReturnType<typeof createProfileSchema>>

/** Your profile (S-ME-02 in L12), in the AppShell. */
export default function Profile() {
    const { t } = useTranslation()
    return (
        <ShellPage title={t('shell.settings.profile')}>
            <ProfileContent />
        </ShellPage>
    )
}

function ProfileContent() {
    const { t } = useTranslation(['users', 'common', 'api'])

    // Dialog States
    const [editOpen, setEditOpen] = useState(false)
    const [cropOpen, setCropOpen] = useState(false)

    // Cropper State
    const [imageSrc, setImageSrc] = useState<string | null>(null)
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
    const [isCropping, setIsCropping] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    /**
     * The last crop, so saving the same image and area again reuses the same
     * Blob. Idempotency keys follow the payload, and a Blob only equals
     * itself: re-cropping for every retry made each retry a new upload.
     */
    const lastCrop = useRef<{ src: string; area: string; blob: Blob } | null>(null)

    // Fetch rich profile data
    const { data: profile, isLoading, error } = useProfile()

    // Update profile mutation
    const updateMutation = useUpdateProfile()

    const refreshAvatar = useAvatarErrorRefresh(profile?.avatarUrl)

    const closeCropper = () => {
        setCropOpen(false)
        setImageSrc(null)
    }

    // Avatar upload mutation
    const avatarMutation = useUpdateAvatar()

    // Object URLs pin the selected file in memory until revoked.
    useEffect(() => {
        if (!imageSrc) return
        return () => URL.revokeObjectURL(imageSrc)
    }, [imageSrc])

    // Not `values`: react-hook-form resets the whole form whenever `values`
    // deep-changes, so a refetch that brings a different name or bio — saved
    // from another tab or device — wipes whatever the user is typing. Instead
    // the form is filled from the latest profile each time the dialog opens.
    const profileSchema = useMemo(() => createProfileSchema(t), [t])
    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: { displayName: '', bio: '' }
    })

    const handleEditOpenChange = (open: boolean) => {
        if (open) {
            form.reset({
                displayName: profile?.displayName || '',
                bio: profile?.bio || ''
            })
        }
        setEditOpen(open)
    }

    const onSubmit = (values: ProfileFormValues) => {
        updateMutation.mutate(values, { onSuccess: () => setEditOpen(false) })
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error(t('api:UPLOAD_INVALID_TYPE'))
            } else {
                // An object URL instead of a data URL: no base64 copy of a
                // possibly multi-megabyte photo held in React state.
                setImageSrc(URL.createObjectURL(file))
                setCrop({ x: 0, y: 0 })
                setZoom(1)
                setCropOpen(true)
            }
        }
        // Reset input value to allow selecting same file again
        event.target.value = ''
    }

    const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, [])

    const handleSaveCrop = async () => {
        if (!imageSrc || !croppedAreaPixels || isCropping) return

        setIsCropping(true)
        try {
            const area = JSON.stringify(croppedAreaPixels)
            const reusable = lastCrop.current?.src === imageSrc && lastCrop.current.area === area
            const croppedImage = reusable ? lastCrop.current!.blob : await getCroppedImg(imageSrc, croppedAreaPixels)
            lastCrop.current = { src: imageSrc, area, blob: croppedImage }
            avatarMutation.mutate(croppedImage, { onSuccess: closeCropper })
        } catch (e) {
            console.error(e)
            toast.error(t('toasts.cropFailed'))
        } finally {
            setIsCropping(false)
        }
    }

    const triggerFileInput = () => {
        fileInputRef.current?.click()
    }

    if (isLoading) {
        return <ProfileSkeleton />
    }

    // Only when there is nothing to show. A failed background refetch (after a
    // save, say) used to replace the loaded page — and any open dialog — with
    // this message.
    if (error && !profile) {
        return (
            <div className='flex flex-col items-center justify-center gap-4 py-16'>
                <p className='text-destructive'>{t('profile.failedToLoad')}</p>
                <Button onClick={() => window.location.reload()}>{t('common:buttons.retry')}</Button>
            </div>
        )
    }

    return (
        <div className='max-w-[720px] p-6 lg:p-8'>
            <div className='grid gap-6'>
                {/* Backend Profile Card */}
                <div className='rounded-lg border bg-card text-card-foreground shadow-sm'>
                    <div className='flex flex-row items-center justify-between space-y-0 p-6'>
                        <div className='flex flex-col space-y-1.5'>
                            <h3 className='font-semibold leading-none tracking-tight'>
                                {t('profile.backendCard.title')}
                            </h3>
                            <p className='text-sm text-muted-foreground'>{t('profile.backendCard.subtitle')}</p>
                        </div>

                        <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
                            <DialogTrigger asChild>
                                <Button variant='outline' size='sm'>
                                    <Pencil className='mr-2 h-4 w-4' />
                                    {t('common:buttons.edit')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className='sm:max-w-[425px]'>
                                <DialogHeader>
                                    <DialogTitle>{t('profile.editDialog.title')}</DialogTitle>
                                    <DialogDescription>{t('profile.editDialog.description')}</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-4 py-4'>
                                    <FormField
                                        label={t('profile.editDialog.displayName')}
                                        error={form.formState.errors.displayName?.message}
                                    >
                                        {(control) => <Input {...control} {...form.register('displayName')} />}
                                    </FormField>
                                    <FormField
                                        label={t('profile.editDialog.bio')}
                                        error={form.formState.errors.bio?.message}
                                    >
                                        {(control) => (
                                            <Textarea className='resize-none' {...control} {...form.register('bio')} />
                                        )}
                                    </FormField>
                                    <DialogFooter>
                                        <Button type='submit' disabled={updateMutation.isPending}>
                                            {updateMutation.isPending && (
                                                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                            )}
                                            {t('common:buttons.saveChanges')}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className='p-6 pt-0 space-y-4'>
                        <div className='flex items-center gap-4'>
                            <div className='relative group'>
                                {/* A real button: a click handler on the avatar's span
                                    left keyboard and screen-reader users no way in. */}
                                <button
                                    type='button'
                                    onClick={triggerFileInput}
                                    disabled={avatarMutation.isPending}
                                    aria-label={t('profile.changeAvatar')}
                                    className='rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                                >
                                    <Avatar className='h-20 w-20 border-2 border-border cursor-pointer group-hover:opacity-90 transition-opacity'>
                                        <AvatarImage
                                            src={profile?.avatarUrl ?? undefined}
                                            alt=''
                                            onLoadingStatusChange={(status) => status === 'error' && refreshAvatar()}
                                        />
                                        <AvatarFallback className='bg-primary/10 text-primary text-2xl font-bold'>
                                            {(profile?.displayName || profile?.username || 'U')
                                                .slice(0, 2)
                                                .toUpperCase()}
                                        </AvatarFallback>
                                        <div className='absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full'>
                                            {avatarMutation.isPending ? (
                                                <Loader2 className='h-6 w-6 text-white animate-spin' />
                                            ) : (
                                                <Camera className='h-6 w-6 text-white' />
                                            )}
                                        </div>
                                    </Avatar>
                                </button>
                                <input
                                    type='file'
                                    ref={fileInputRef}
                                    className='hidden'
                                    accept='image/*'
                                    onChange={handleFileChange}
                                    disabled={avatarMutation.isPending}
                                />
                            </div>

                            <div>
                                <p className='font-medium text-lg'>{profile?.displayName || profile?.username}</p>
                                <p className='text-sm text-muted-foreground'>@{profile?.username}</p>
                            </div>
                        </div>

                        <div className='rounded-md bg-muted p-4'>
                            <p className='text-sm font-mono whitespace-pre-wrap'>
                                {profile?.bio || t('profile.noBio')}
                            </p>
                        </div>

                        <div>
                            <span className='text-xs font-semibold uppercase text-muted-foreground'>
                                {t('common:labels.roles')}
                            </span>
                            <div className='flex gap-2 mt-2'>
                                {(profile?.roles ?? []).map((role) => (
                                    <span
                                        key={role}
                                        className='inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80'
                                    >
                                        {role}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Danger Zone Card */}
                <div className='rounded-lg border border-destructive/20 bg-card text-card-foreground shadow-sm mt-2'>
                    <div className='flex flex-row items-center justify-between space-y-0 p-6'>
                        <div className='flex flex-col space-y-1.5'>
                            <h3 className='font-semibold leading-none tracking-tight text-destructive'>
                                {t('profile.dangerZone.title')}
                            </h3>
                            <p className='text-sm text-muted-foreground'>{t('profile.dangerZone.subtitle')}</p>
                        </div>

                        <DeleteAccountDialog />
                    </div>
                </div>
            </div>

            {/* Avatar Cropper Modal */}
            <Dialog open={cropOpen} onOpenChange={(open) => (open ? setCropOpen(true) : closeCropper())}>
                <DialogContent className='sm:max-w-[600px]'>
                    <DialogHeader>
                        <DialogTitle>{t('profile.cropDialog.title')}</DialogTitle>
                        <DialogDescription>{t('profile.cropDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <div className='relative w-full h-[400px] bg-black/5 rounded-md overflow-hidden mt-4'>
                        {imageSrc && (
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        )}
                    </div>
                    <div className='py-4 flex gap-4 items-center'>
                        <span className='text-sm font-medium w-12 text-center'>{t('common:labels.zoom')}</span>
                        <Slider
                            value={[zoom]}
                            min={1}
                            max={3}
                            step={0.1}
                            onValueChange={([value]) => setZoom(value ?? 1)}
                            className='flex-1'
                        />
                    </div>
                    <DialogFooter>
                        <Button variant='outline' onClick={closeCropper}>
                            {t('common:buttons.cancel')}
                        </Button>
                        <Button onClick={handleSaveCrop} disabled={isCropping || avatarMutation.isPending}>
                            {(isCropping || avatarMutation.isPending) && (
                                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('common:buttons.savePicture')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
