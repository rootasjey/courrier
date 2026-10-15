export const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function createPasswordResetToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function hashPasswordResetValue(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function escapePasswordResetHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export function passwordResetEmail(locale: 'fr' | 'en', resetUrl: string) {
  const safeUrl = escapePasswordResetHtml(resetUrl)
  if (locale === 'en') {
    return {
      subject: 'Reset your Courrier password',
      text: `Use this link to set a new Courrier password. It expires in one hour and can only be used once:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#282533;max-width:600px;margin:auto;padding:32px"><p style="color:#6655d8;font-weight:700">Courrier</p><h1>Reset your password</h1><p>Use the link below to choose a new password. It expires in one hour and can only be used once.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#6655d8;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Choose a new password</a></p><p>If you did not request this, ignore this email.</p></div>`,
    }
  }

  return {
    subject: 'Réinitialise ton mot de passe Courrier',
    text: `Utilise ce lien pour choisir un nouveau mot de passe Courrier. Il expire dans une heure et ne peut servir qu’une seule fois :\n${resetUrl}\n\nSi tu n’as pas demandé cette réinitialisation, ignore cet e-mail.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#282533;max-width:600px;margin:auto;padding:32px"><p style="color:#6655d8;font-weight:700">Courrier</p><h1>Réinitialise ton mot de passe</h1><p>Choisis un nouveau mot de passe avec le lien ci-dessous. Il expire dans une heure et ne peut servir qu’une seule fois.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#6655d8;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Choisir un nouveau mot de passe</a></p><p>Si tu n’as pas demandé cette réinitialisation, ignore cet e-mail.</p></div>`,
  }
}
