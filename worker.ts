import nitroWorker from './.output/server/index.mjs'
import { handleIncomingEmail } from './server/utils/email-handler'
import type { MailStorageBindings } from './server/utils/mail-store'
import { mirrorMailObjects } from './server/utils/r2-backup'

type CourrierWorkerEnv = Env & MailStorageBindings & { BACKUP_STORE: R2Bucket }

export default {
  ...nitroWorker,

  async email(message, env): Promise<void> {
    await handleIncomingEmail(message, env)
  },

  async scheduled(_controller, env): Promise<void> {
    await mirrorMailObjects(env)
  },
} satisfies ExportedHandler<CourrierWorkerEnv>
