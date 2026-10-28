import nitroWorker from './.output/server/index.mjs'
import { handleIncomingEmail } from './server/utils/email-handler'
import type { MailStorageBindings } from './server/utils/mail-store'
import { mirrorMailObjects } from './server/utils/r2-backup'
import { pruneWorkspaceActivity } from './server/utils/workspace-activity'
import { pruneInboundEmailEvents } from './server/utils/inbound-email-events'

type CourrierWorkerEnv = Env & MailStorageBindings & { BACKUP_STORE: R2Bucket }

export default {
  ...nitroWorker,

  async email(message, env): Promise<void> {
    await handleIncomingEmail(message, env)
  },

  async scheduled(_controller, env): Promise<void> {
    const results = await Promise.allSettled([
      mirrorMailObjects(env),
      pruneWorkspaceActivity(env.DB),
      pruneInboundEmailEvents(env.DB),
    ])
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  },
} satisfies ExportedHandler<CourrierWorkerEnv>
