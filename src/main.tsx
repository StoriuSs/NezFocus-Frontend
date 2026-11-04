import './config/zod' // before any schema parses (src/config/env.ts does on import)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initErrorTracking, rootErrorHandlers } from '@/lib/error-tracking'
import './index.css'
import '@/i18n' // Initialize i18n
import App from '@/app/App'
import { connectApiSession } from '@/lib/api'
import { apiSession } from '@/features/auth'

// The API client asks the session for tokens, and tells it when the API ended
// it. Shared code imports no feature, so the two are connected here.
connectApiSession(apiSession)

// Before rendering, so errors during the first render are reported too. It
// waits only when this deployment has error tracking on (a cached chunk).
void initErrorTracking().then(() =>
    createRoot(document.getElementById('root')!, rootErrorHandlers()).render(
        <StrictMode>
            <App />
        </StrictMode>
    )
)
