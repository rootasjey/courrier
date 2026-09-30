type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'

type ClassificationBindings = {
  DB?: D1Database
}

const folders = new Set<MailFolder>(['Imbox', 'The Feed', 'Paper Trail'])

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as ClassificationBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const body = await readBody<{ folder?: unknown }>(event)
  if (typeof body?.folder !== 'string' || !folders.has(body.folder as MailFolder)) {
    throw createError({ statusCode: 400, statusMessage: 'Boîte de destination invalide.' })
  }

  const message = await bindings.DB.prepare(`
    SELECT id FROM messages WHERE id = ?
  `).bind(messageId).first<{ id: string }>()

  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  }

  await bindings.DB.prepare(`
    UPDATE messages SET folder = ? WHERE id = ?
  `).bind(body.folder, messageId).run()

  return { folder: body.folder }
})
