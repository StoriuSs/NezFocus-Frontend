/// <reference types="vite/client" />

// Typed so a misspelled variable is a compile error. Keep in step with
// src/config/env.schema.ts, which validates the values.
interface ImportMetaEnv {
    readonly VITE_API_URL: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
