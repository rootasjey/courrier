export const TRONCHE_AVATAR_VARIANTS = ['beam', 'pixel', 'sunset', 'ring', 'bauhaus', 'marble'] as const

export type TroncheAvatarVariant = typeof TRONCHE_AVATAR_VARIANTS[number]
export type TroncheAvatarConfig = {
  name: string
  variant: TroncheAvatarVariant
  colors: string[]
  square: boolean
}

const DEFAULT_TRONCHE_COLORS = ['#1B4EF5', '#3874FF', '#5996FF', '#F4CEFF', '#9FA1FF']
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function isTroncheAvatarConfig(value: unknown): value is TroncheAvatarConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Record<string, unknown>
  return typeof config.name === 'string'
    && config.name.trim().length > 0
    && config.name.length <= 120
    && !/[\u0000-\u001f\u007f]/.test(config.name)
    && typeof config.variant === 'string'
    && TRONCHE_AVATAR_VARIANTS.includes(config.variant as TroncheAvatarVariant)
    && Array.isArray(config.colors)
    && config.colors.length >= 2
    && config.colors.length <= 12
    && config.colors.every(color => typeof color === 'string' && HEX_COLOR.test(color))
    && typeof config.square === 'boolean'
}

export function parseTroncheAvatarUrl(value: string, fallbackName = 'Courrier'): TroncheAvatarConfig | null {
  if (value.length > 2048) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || !['tronche.cc', 'www.tronche.cc'].includes(url.hostname)
    || !['/playground', '/playground/'].includes(url.pathname)
    || url.port || url.username || url.password) return null

  const name = (url.searchParams.get('name') || fallbackName).trim()
  const variant = url.searchParams.get('variant') || 'beam'
  const colors = url.searchParams.has('colors')
    ? (url.searchParams.get('colors') || '').split(',').map(color => color.trim())
    : DEFAULT_TRONCHE_COLORS
  const square = url.searchParams.get('square') === 'true'
  const config = { name, variant, colors, square }

  return isTroncheAvatarConfig(config) ? config : null
}
