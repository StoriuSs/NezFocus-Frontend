import { useAuthOptions } from '../api/useAuthOptions'
import { OAUTH_PROVIDERS, type OAuthProvider } from '../lib/oauth'

/**
 * The providers both the API is configured for and this app has a button for.
 * Empty while loading, and if the API cannot be asked: no button beats a
 * button that leads nowhere.
 */
export function useOAuthProviders(): OAuthProvider[] {
    const { providers } = useAuthOptions()
    return OAUTH_PROVIDERS.filter((provider) => providers.includes(provider))
}
