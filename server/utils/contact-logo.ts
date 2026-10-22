const PERSONAL_EMAIL_DOMAINS = new Set([
  'aol.com', 'bbox.fr', 'free.fr', 'gmx.com', 'gmail.com', 'googlemail.com',
  'hotmail.com', 'icloud.com', 'laposte.net', 'live.com', 'mac.com', 'me.com',
  'mail.com', 'orange.fr', 'outlook.com', 'proton.me', 'protonmail.com',
  'sfr.fr', 'wanadoo.fr', 'yahoo.com', 'yahoo.fr', 'yandex.com', 'yandex.ru',
])

export function contactLogoUrl(address: string, publishableKey: string | undefined) {
  const key = publishableKey?.trim()
  if (!key) return null

  const domain = address.slice(address.lastIndexOf('@') + 1).toLocaleLowerCase('en-US').replace(/\.$/, '')
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain) || /\.(?:example|invalid|localhost|test)$/.test(domain)) return null
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null

  const url = new URL(`https://img.logo.dev/${domain}`)
  url.searchParams.set('token', key)
  url.searchParams.set('size', '128')
  url.searchParams.set('format', 'png')
  url.searchParams.set('fallback', 'monogram')
  return url.toString()
}
