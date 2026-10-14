export function normalizeWorkspaceDomain(value: unknown) {
  if (typeof value !== 'string') return null

  const input = value.trim()
  if (!input || input.length > 255 || /[\s\/?#@:%\\]/u.test(input)) return null

  const withoutTrailingDot = input.endsWith('.') ? input.slice(0, -1) : input
  if (!withoutTrailingDot || withoutTrailingDot.endsWith('.')) return null

  let hostname: string
  try {
    hostname = new URL(`https://${withoutTrailingDot}`).hostname.toLowerCase()
  } catch {
    return null
  }

  if (hostname.startsWith('[') || hostname.length > 253) return null
  const labels = hostname.split('.')
  if (labels.length < 2 || labels.some(label =>
    label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
  )) return null

  const topLevelLabel = labels.at(-1)!
  if (!/[a-z]/u.test(topLevelLabel) || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return null
  return hostname
}

export function createDomainVerificationToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function domainVerificationRecord(domain: string, token: string) {
  return {
    recordName: `_courrier-verification.${domain}`,
    recordValue: `courrier-verification=${token}`,
  }
}

export function normalizeTxtAnswer(value: string) {
  const chunks = value.match(/"(?:\\.|[^"\\])*"/gu)
  if (!chunks) return value.trim()

  try {
    return chunks.map(chunk => JSON.parse(chunk) as string).join('')
  } catch {
    return ''
  }
}
