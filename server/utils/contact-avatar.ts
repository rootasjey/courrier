export const MAX_CONTACT_AVATAR_BYTES = 5 * 1024 * 1024

export function contactAvatarImageType(data: Uint8Array): string | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

export function contactAvatarObjectKey(workspaceId: string, contactId: string) {
  return `contact-avatars/${workspaceId}/${contactId}/${crypto.randomUUID()}`
}

export function isContactId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
