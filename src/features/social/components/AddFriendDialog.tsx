import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Loader2, UserX } from 'lucide-react'
import { toast } from 'sonner'
import '@/i18n/social'
import { FormField } from '@/components/form/FormField'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProfile } from '@/features/users'
import { useCountdown } from '@/hooks/useCountdown'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import { cn } from '@/lib/utils'
import { useAcceptFriendRequest, useLookUpPerson, useSendFriendRequest } from '../api/useRelationshipActions'
import { useMessagePerson } from '../api/useDmActions'
import { addFriendProblem, normalizedUsername, NOTE_MAX, type AddFriendProblem } from '../lib/add-friend'
import { nameOf } from '../lib/friends-list'
import type { PersonProfile, Relationship } from '../types'

interface Values {
    username: string
    note: string
}

/**
 * The Add friend dialog (S-DM-02 `add-friend`, D-110, C-14 form 440): a
 * username looked up first ("Find", Enter too), its card showing where we
 * stand and the servers we share; then "Send request", or "Accept" when
 * they asked me. Typing in the field again drops the card. Every refusal
 * is said under the field, the focus back in it with its words selected
 * (S-DM-02 › Lỗi); anything else is the usual Toast.
 *
 * Done, it closes and `onDone` hands the relationship after: `outgoing`
 * (the page goes to Pending › Sent) or `friend` (to All).
 */
export function AddFriendDialog({ onClose, onDone }: { onClose: () => void; onDone: (entry: Relationship) => void }) {
    const { t } = useTranslation('social')
    const ownUsername = useProfile().data?.username ?? null
    const lookUp = useLookUpPerson()
    const send = useSendFriendRequest()
    const accept = useAcceptFriendRequest()
    // The dialog closes with the Friends page as the DM opens; a failure leaves it open, with the Toast.
    const { message: messagePerson } = useMessagePerson()
    const [card, setCard] = useState<PersonProfile | null>(null)
    const [problem, setProblem] = useState<AddFriendProblem | null>(null)
    const [lookupUntil, setLookupUntil] = useState<number | null>(null)
    const wait = useCountdown(lookupUntil)

    const {
        register,
        handleSubmit,
        control,
        setFocus,
        formState: { isSubmitting }
    } = useForm<Values>({ defaultValues: { username: '', note: '' } })
    const note = useWatch({ control, name: 'note' })

    const usernameField = register('username', {
        onChange: () => {
            setCard(null)
            setProblem(null)
        }
    })

    function refuse(next: AddFriendProblem) {
        if (next.kind === 'failed') return
        setProblem(next)
        if (next.kind === 'lookupLimit') setLookupUntil(Date.now() + next.waitSeconds * 1000)
        setFocus('username', { shouldSelect: true })
    }

    function failed(error: unknown) {
        const next = addFriendProblem(error)
        if (next.kind === 'failed') notifyMutationError(error)
        else refuse(next)
    }

    async function submit({ username, note: typedNote }: Values) {
        const wanted = normalizedUsername(username)
        if (!wanted) return refuse({ kind: 'empty' })
        if (wanted === ownUsername) return refuse({ kind: 'own' })
        setProblem(null)
        if (!card) {
            try {
                setCard(await lookUp(wanted))
            } catch (error) {
                failed(error)
            }
            return
        }
        if (card.relationship === 'incoming') {
            try {
                onDone(await accept.mutateAsync(card.user.id))
                onClose()
            } catch (error) {
                // Their request went meanwhile (09 › Edge): said as on the Friends page, the card
                // gone with it; any other failure is the hook's Toast.
                if (getApiErrorType(error) !== 'NOT_FOUND_ERROR') return
                toast(t('toasts.gone'), { icon: <UserX className='size-4' aria-hidden='true' /> })
                setCard(null)
            }
            return
        }
        try {
            onDone(await send.mutateAsync({ username: wanted, note: typedNote.trim() || null }))
            onClose()
        } catch (error) {
            failed(error)
        }
    }

    const shownName = card ? (nameOf(card.user) ?? '') : ''
    const message = problemText(problem, t, { name: shownName, username: card?.user.username ?? '', wait })
    const limited = problem?.kind === 'lookupLimit' && wait > 0 && !card
    const sendOff = card?.relationship === 'friend' || (problem?.kind === 'dailyLimit' && card !== null)

    return (
        <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className='grid gap-4'>
                    <DialogHeader>
                        <DialogTitle>{t('add.title')}</DialogTitle>
                        <DialogDescription>{t('add.description')}</DialogDescription>
                    </DialogHeader>
                    <div className='grid gap-3'>
                        <FormField label={t('add.username')} error={message ?? undefined}>
                            {(field) => (
                                <Input
                                    autoComplete='off'
                                    autoCapitalize='none'
                                    spellCheck={false}
                                    placeholder={t('add.placeholder')}
                                    readOnly={isSubmitting}
                                    {...field}
                                    {...usernameField}
                                />
                            )}
                        </FormField>
                        {card ? (
                            <PersonCard profile={card} name={shownName} onMessage={() => messagePerson(card.user.id)} />
                        ) : null}
                        {card ? (
                            <FormField
                                label={t('add.note')}
                                className='mt-2 grid gap-1'
                                action={
                                    <span
                                        className={cn(
                                            'font-numeric tabular-nums',
                                            note.length >= NOTE_MAX ? 'text-text-secondary' : 'text-text-tertiary'
                                        )}
                                    >
                                        {note.length}/{NOTE_MAX}
                                    </span>
                                }
                            >
                                {(field) => (
                                    <Input
                                        maxLength={NOTE_MAX}
                                        readOnly={isSubmitting}
                                        disabled={card.relationship === 'friend'}
                                        {...field}
                                        {...register('note')}
                                    />
                                )}
                            </FormField>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={isSubmitting} onClick={onClose}>
                            {t('add.cancel')}
                        </Button>
                        <Button type='submit' disabled={isSubmitting || limited || sendOff}>
                            {isSubmitting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {!card ? t('add.find') : card.relationship === 'incoming' ? t('add.accept') : t('add.send')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

/** The words under the field for a refusal; null for none. */
function problemText(
    problem: AddFriendProblem | null,
    t: TFunction<'social'>,
    { name, username, wait }: { name: string; username: string; wait: number }
): string | null {
    if (!problem) return null
    switch (problem.kind) {
        case 'failed':
            return null
        case 'lookupLimit':
            return wait > 0 ? t('add.problems.lookupLimit', { count: wait }) : null
        case 'pending':
            return t('add.problems.pending', { username })
        case 'alreadyFriends':
            return t('add.problems.alreadyFriends', { name })
        default:
            return t(`add.problems.${problem.kind}`)
    }
}

/**
 * The card of someone looked up (D-110 R12): avatar 48, name and username,
 * the bio (two lines at most), a line, then the servers we share (two
 * named, then how many more) and where we stand when there is something.
 */
function PersonCard({ profile, name, onMessage }: { profile: PersonProfile; name: string; onMessage: () => void }) {
    const { t } = useTranslation('social')
    const [first, second] = profile.mutualServers
    const shared = !first
        ? t('add.card.noShared')
        : !second
          ? t('add.card.sharedOne', { first: first.name })
          : profile.mutualServers.length === 2
            ? t('add.card.sharedTwo', { first: first.name, second: second.name })
            : t('add.card.sharedMore', {
                  first: first.name,
                  second: second.name,
                  count: profile.mutualServers.length - 2
              })
    const standing =
        profile.relationship === 'friend'
            ? t('add.card.friends')
            : profile.relationship === 'outgoing'
              ? t('add.card.outgoing', { name })
              : profile.relationship === 'incoming'
                ? t('add.card.incoming', { name })
                : null

    return (
        <section aria-label={name} className='flex gap-3 rounded-input bg-surface-2 p-4'>
            <Avatar className='size-12'>
                <AvatarImage src={profile.user.avatarUrl ?? undefined} alt='' className='object-cover' />
                <AvatarFallback className='bg-surface-3 text-body font-semibold text-text-primary'>
                    <AvatarInitial name={name} />
                </AvatarFallback>
            </Avatar>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
                <p className='flex min-w-0 items-baseline gap-1.5'>
                    <span className='truncate text-body font-semibold text-text-primary'>{name}</span>
                    {profile.user.username && profile.user.displayName ? (
                        <span className='truncate text-label text-text-tertiary'>{profile.user.username}</span>
                    ) : null}
                </p>
                {profile.bio ? <p className='line-clamp-2 text-body-sm text-text-primary'>{profile.bio}</p> : null}
                <hr className='my-1 border-border' />
                <p className='line-clamp-2 text-label text-text-secondary'>{shared}</p>
                {standing ? (
                    <p className='flex items-center gap-2 text-label font-semibold text-text-primary'>
                        {standing}
                        {profile.relationship === 'friend' ? (
                            <Button type='button' variant='text' size='sm' onClick={onMessage}>
                                {t('friends.message')}
                            </Button>
                        ) : null}
                    </p>
                ) : null}
            </div>
        </section>
    )
}
