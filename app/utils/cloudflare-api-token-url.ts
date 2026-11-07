const CLOUDFLARE_TOKEN_CREATION_URL = 'https://dash.cloudflare.com/profile/api-tokens'

/** Opens Cloudflare's user-token form with a suggested, Courrier-specific name. */
export function cloudflareApiTokenCreationUrl(domain?: string) {
  const url = new URL(CLOUDFLARE_TOKEN_CREATION_URL)
  url.searchParams.set('name', domain?.trim() ? `Courrier ${domain.trim().toLowerCase()}` : 'Courrier Email Routing')
  return url.toString()
}
