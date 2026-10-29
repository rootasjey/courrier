import type { H3Event } from 'h3'
import { requireFreshAccountMfa } from './account-auth'

type HttpErrorLike = { statusCode?: number, statusMessage?: string }

export async function requireFreshWorkspaceMfa(event: H3Event, userId: string) {
  try {
    await requireFreshAccountMfa(event, userId)
  } catch (error) {
    const httpError = error as HttpErrorLike
    if (httpError.statusCode !== 403) throw error

    throw createError({
      statusCode: 403,
      statusMessage: httpError.statusMessage || 'Une vérification de sécurité est requise.',
      data: { code: 'mfa_required' },
    })
  }
}
