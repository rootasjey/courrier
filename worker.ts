import nitroWorker from './.output/server/index.mjs'
import { handleIncomingEmail } from './server/utils/email-handler'
import type { MailStorageBindings } from './server/utils/mail-store'

type CourrierWorkerEnv = Env & MailStorageBindings

export default {
  ...nitroWorker,

  async email(message, env): Promise<void> {
    await handleIncomingEmail(message, env)
  },
} satisfies ExportedHandler<CourrierWorkerEnv>
