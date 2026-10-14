import { assertSameOrigin } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  await clearUserSession(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { loggedOut: true }
})
