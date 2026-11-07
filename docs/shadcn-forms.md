# shadcn/ui and forms

How to add a UI component, show a toast, and build a validated form the way
the rest of the app does.

- [shadcn/ui](#shadcnui)
- [Toasts](#toasts)
- [Forms: React Hook Form and zod](#forms-react-hook-form-and-zod)
- [Messages in the user's language](#messages-in-the-users-language)
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

zod runs in "jitless" mode (`src/config/zod.ts`, imported first in
`main.tsx`): the production Content-Security-Policy forbids the `new Function`
zod would otherwise try, and each attempt was reported as a CSP violation.

## Messages in the user's language

Build the schema inside the component with `t()`, as above, and memoise it on
`t`: when the language changes, `t` changes, and the messages with it. A
schema written at module level would keep the language it was created in.

## Sending a form to the API

Submit through a mutation hook in the feature's `api/` folder
([data-fetching.md](./data-fetching.md#mutations-and-idempotency)). To show
an API error under a field rather than as a toast, turn the toast off for
that mutation (`meta: { errorToast: false }`) and call React Hook Form's
`setError` with the message for the error's `type`. The auth pages do this
throughout ([auth/forms-and-errors.md](./auth/forms-and-errors.md)).
