# shadcn/ui and forms

How to add a UI component, show a toast, and build a validated form the way
the rest of the app does.

- [shadcn/ui](#shadcnui)
- [Toasts](#toasts)
- [Forms: React Hook Form and zod](#forms-react-hook-form-and-zod)
- [Messages in the user's language](#messages-in-the-users-language)
- [Rules that read the app's data](#rules-that-read-the-apps-data)
- [When an error goes](#when-an-error-goes)
- [Sending a form to the API](#sending-a-form-to-the-api)

## shadcn/ui

[shadcn/ui](https://ui.shadcn.com) is not a package you install: its CLI
copies a component's source into `src/components/ui/`, where it is yours to
edit. To add one:

```bash
pnpm dlx shadcn@latest add card
```

The CLI reads `components.json` (where the components go, the Tailwind
config, the `@/` alias). What is already there:
[components.md](./components.md#shadcnui-components).

## Toasts

**Sonner** shows the toasts. The `<Toaster />` is mounted once, in
`src/app/App.tsx`, and follows the theme (`src/components/ui/sonner.tsx`).

```tsx
import { toast } from 'sonner'

toast.success(t('users:toasts.profileUpdated'))
toast.error(t('…'), { description: t('…') })
toast.promise(save(), { loading: t('…'), success: t('…'), error: t('…') })
```

A failed mutation already gets an error toast from the query client, so
don't add another in its `onError`
([data-fetching.md](./data-fetching.md#showing-api-errors)).

## Forms: React Hook Form and zod

A form is a **zod schema** (the rules), **React Hook Form** (the state), and
**`FormField`** (`src/components/form/FormField.tsx`), which lays out a label,
the control and its error, and wires them for screen readers. The auth
pages are complete examples (`src/features/auth/pages/ForgotPassword.tsx` is
the shortest), though they keep their messages as keys instead of building
the schema with `t()` ([auth/forms-and-errors.md](./auth/forms-and-errors.md#messages-kept-as-keys)).

1. **The schema** — built with `t()`, so the messages follow the language:

   ```ts
   import * as z from 'zod'

   const createSchema = (t: TFunction<['pages', 'common']>) =>
       z.object({
           email: z.email(t('common:validation.emailInvalid')),
           password: z.string().min(6, t('common:validation.passwordTooShort'))
       })

   type FormValues = z.infer<ReturnType<typeof createSchema>>
   ```

   This is zod 4: `z.email()`, not the older `z.string().email()`.

2. **The form**:

   ```tsx
   const { t } = useTranslation(['pages', 'common'])
   const schema = useMemo(() => createSchema(t), [t])
   const {
       register,
       handleSubmit,
       formState: { errors, isSubmitting }
   } = useForm<FormValues>({ resolver: zodResolver(schema) })
   ```

3. **The fields** — `FormField` hands the control its `id`,
   `aria-invalid` and `aria-describedby`; spread them onto the input with
   `register`:

   ```tsx
   <form onSubmit={handleSubmit(onSubmit)}>
       <FormField label={t('myForm.email')} error={errors.email?.message}>
           {(control) => <Input type='email' {...control} {...register('email')} />}
       </FormField>
       <Button type='submit' disabled={isSubmitting}>
           {t('common:buttons.save')}
       </Button>
   </form>
   ```

   `FormField` also takes a `hint`, shown under the control while there is no
   error, and an `action`, a link at the end of the label's row.

4. **Controls that are not a text field** (`OptionCards`, `Select`,
   `SwitchRow`, `SegmentedControl`, a list of roles to tick) go through
   React Hook Form's `Controller`, which hands them `value` and `onChange`
   (`src/features/servers/components/dialogs/CreateChannelDialog.tsx`). A
   text field that goes through `Controller` too (one that stops at its limit
   while typing) gets `field.ref` on its input, so a failed submit can put the
   focus there. What is not sent, such as a cropped picture, stays in
   `useState`.

zod runs in "jitless" mode (`src/config/zod.ts`, imported first in
`main.tsx`): the production Content-Security-Policy forbids the `new Function`
zod would otherwise try, and each attempt was reported as a CSP violation.

## Messages in the user's language

Build the schema inside the component with `t()`, as above, and memoise it on
`t`: when the language changes, `t` changes, and the messages with it. A
schema written at module level would keep the language it was created in.

An error already on screen keeps the words it was made with until the next
check. To have it follow a language changed meanwhile, put it into words where
it is shown: a field with one message reads `errors.name ? t('…') : undefined`
(`CreateServerDialog`); one with several keeps keys as its messages
([auth/forms-and-errors.md](./auth/forms-and-errors.md#messages-kept-as-keys)).

## Rules that read the app's data

A rule that checks what the app knows now, such as a channel name already
used in its category, goes in the schema too, through `superRefine`. Build the
schema from that data and memoise it on it:
`useMemo(() => createSchema(t, server), [t, server])`
(`CreateChannelDialog`, `ChannelSettingsDialog`). The API checks again; its
refusal still goes under the field with `setError`
([below](#sending-a-form-to-the-api)).

## When an error goes

The server dialogs take a field's error away as soon as the field changes, and
check again only on the next click: `reValidateMode: 'onSubmit'` in
`useForm`, and `clearErrors('name')` in the control's `onChange`. A change to
another field that the rule reads (the channel's type or category) clears it
too. Without `reValidateMode`, React Hook Form checks every change after the
first submit, so the error would come back while the person is still typing.

A form is not sent twice: its submit button is disabled while the request is
out, and a disabled default button also stops Enter, as HTML says. Creating a
server or a channel has a second guard, `useIdempotentMutation`, which hands
back the request in flight for the same payload. A dialog with no `<form>`,
sent by a button and by Ctrl + Enter (Tạm khóa, Mời ra, Cấm), checks
`isPending` itself before sending.

## Sending a form to the API

Submit through a mutation hook in the feature's `api/` folder
([data-fetching.md](./data-fetching.md#mutations-and-idempotency)). To show
an API error under a field rather than as a toast, turn the toast off for
that mutation (`meta: { errorToast: false }`) and call React Hook Form's
`setError` with the message for the error's `type`. The auth pages do this
throughout ([auth/forms-and-errors.md](./auth/forms-and-errors.md)).
