export function assertSameOrigin(event) {
  if (event.origin && event.origin !== event.requestUrl.origin) {
    throw Object.assign(new Error('Origine incorrecte.'), { statusCode: 403 })
  }
}

export function getAccountDb(event) {
  return event.context.cloudflare.env.DB
}

export async function requirePlatformAdmin(event) {
  if (!event.context.platformAdmin) {
    throw Object.assign(new Error('Accès administrateur requis.'), { statusCode: 403 })
  }
  return event.context.platformAdmin
}
