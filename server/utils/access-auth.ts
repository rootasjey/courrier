import type { H3Event } from 'h3'

type AccessIdentity = {
  email?: string
}

type AccessContext = {
  getIdentity: () => Promise<AccessIdentity | undefined>
}

/** Return the identity Cloudflare Access verified for this Worker request. */
export async function requireAccessIdentity(event: H3Event) {
  const access = event.context.cloudflare?.context?.access as AccessContext | undefined

  if (!access) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentification Cloudflare Access requise.',
    })
  }

  try {
    const identity = await access.getIdentity()

    if (identity?.email) return identity
  } catch {
    // Fail closed if Cloudflare cannot provide a verified identity.
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Identité Cloudflare Access introuvable.',
  })
}
