import type { H3Event } from 'h3'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type AccessIdentity = {
  email?: string
}

type AccessContext = {
  getIdentity: () => Promise<AccessIdentity | undefined>
}

type AccessRuntimeEnv = {
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
}

type CloudflareEventContext = {
  context?: { access?: AccessContext }
  env?: AccessRuntimeEnv
}

let cachedJwksUrl: string | undefined
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined

function getAccessJwks(teamDomain: string) {
  const jwksUrl = new URL('/cdn-cgi/access/certs', teamDomain).href

  if (jwksUrl !== cachedJwksUrl) {
    cachedJwksUrl = jwksUrl
    cachedJwks = createRemoteJWKSet(new URL(jwksUrl))
  }

  return cachedJwks!
}

/** Return the identity Cloudflare Access verified for this Worker request. */
export async function requireAccessIdentity(event: H3Event) {
  const cloudflare = event.context.cloudflare as CloudflareEventContext | undefined
  const access = cloudflare?.context?.access

  if (access) {
    try {
      const identity = await access.getIdentity()

      if (identity?.email) return identity
    } catch {
      // Fall through to JWT validation when the native context is unavailable.
    }
  }

  // The internal Static Assets router does not pass ctx.access to the app Worker.
  // In that runtime, validate Access's signed assertion header instead.
  const token = getHeader(event, 'cf-access-jwt-assertion')
  const teamDomain = cloudflare?.env?.CF_ACCESS_TEAM_DOMAIN
  const audience = cloudflare?.env?.CF_ACCESS_AUD

  if (token && teamDomain && audience) {
    try {
      const { payload } = await jwtVerify(token, getAccessJwks(teamDomain), {
        issuer: teamDomain,
        audience,
      })

      if (typeof payload.email === 'string') return { email: payload.email }
    } catch {
      // Reject invalid, expired, or incorrectly scoped assertions below.
    }
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Identité Cloudflare Access requise ou invalide.',
  })
}
