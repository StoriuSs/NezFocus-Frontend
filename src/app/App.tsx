import { useEffect, useRef, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/features/auth/auth.store'
import { announceSignOut } from '@/features/auth/lib/sign-out-notice'
import { router } from '@/app/router'
import { Toaster } from '@/components/ui/sonner'

function App() {
    const initAuth = useAuthStore((state) => state.initAuth)
    const takeSignOutReason = useAuthStore((state) => state.takeSignOutReason)
    const isInitialized = useRef(false)
    const [loading, setLoading] = useState(true)

    // Restore the session exactly once on mount
    useEffect(() => {
        if (isInitialized.current) return
        isInitialized.current = true

        void initAuth().finally(() => {
            setLoading(false)
        })
    }, [initAuth])

    // A session that ended (expired, signed out elsewhere, account deleted)
    // reloads the app, at sign-in or at home (auth.store.ts, logout); say why,
    // once the toaster is mounted.
    useEffect(() => {
        if (loading) return
        announceSignOut(takeSignOutReason())
    }, [loading, takeSignOutReason])

    if (loading) {
        return (
            <div className='h-screen w-screen flex items-center justify-center bg-background'>
                <Loader2 className='animate-spin' />
            </div>
        )
    }

    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            <Toaster />
        </QueryClientProvider>
    )
}

export default App
