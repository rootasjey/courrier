const CLOUDFLARE_TOKEN_CREATION_URL = 'https://dash.cloudflare.com/profile/api-tokens'

/** Opens Cloudflare's user-token form with a suggested, domain-specific name. */
export function cloudflareApiTokenCreationUrl(domain: string) {
  const url = new URL(CLOUDFLARE_TOKEN_CREATION_URL)
  url.searchParams.set('name', `Courrier ${domain.trim().toLowerCase()}`)
  return url.toString()
}
