import type { MailboxKey } from '~/utils/mailbox-routing'

export type MailboxFolder = Exclude<MailboxKey, 'Screener' | 'Trash' | 'Set Aside' | 'Reply Later'>
export type StoredFolder = Exclude<MailboxKey, 'Set Aside' | 'Reply Later'>

export type WorkspaceTag = {
  id: string
  name: string
  color: string
}
