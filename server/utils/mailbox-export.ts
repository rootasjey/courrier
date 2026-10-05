export type MailboxExportMessage = {
  id: string
  is_read: number | boolean
  is_outgoing: number | boolean
  is_set_aside: number | boolean
  is_reply_later: number | boolean
  [key: string]: unknown
}

export type MailboxExportAttachment = {
  message_id: string
  object_key: string
  [key: string]: unknown
}

export type MailboxExportData = {
  messages: MailboxExportMessage[]
  attachments: MailboxExportAttachment[]
  senderRules: Record<string, unknown>[]
  blockedSenders: Record<string, unknown>[]
  senderRuleChanges: Record<string, unknown>[]
  senderRuleChangeMessages: Record<string, unknown>[]
  senderRuleChangeMerges: Record<string, unknown>[]
  drafts: Record<string, unknown>[]
  threadMerges: Record<string, unknown>[]
  threadMergeMembers: Record<string, unknown>[]
}

export function createMailboxExportManifest(data: MailboxExportData, createdAt = new Date()) {
  const attachmentsByMessage = new Map<string, MailboxExportAttachment[]>()
  for (const attachment of data.attachments) {
    const rows = attachmentsByMessage.get(attachment.message_id) || []
    rows.push(attachment)
    attachmentsByMessage.set(attachment.message_id, rows)
  }
  for (const rows of attachmentsByMessage.values()) {
    rows.sort((left, right) => {
      const index = (key: string) => {
        const value = key.slice(key.lastIndexOf('/') + 1)
        return /^\d+$/.test(value) ? Number(value) : Number.MAX_SAFE_INTEGER
      }
      return index(left.object_key) - index(right.object_key)
    })
  }

  return {
    format: 'courrier-mailbox-export',
    version: 2,
    createdAt: createdAt.toISOString(),
    messages: data.messages.map(message => ({
      ...message,
      is_read: Boolean(message.is_read),
      is_outgoing: Boolean(message.is_outgoing),
      is_set_aside: Boolean(message.is_set_aside),
      is_reply_later: Boolean(message.is_reply_later),
      original: `messages/${message.id}.eml`,
      attachments: attachmentsByMessage.get(message.id) || [],
    })),
    senderRules: data.senderRules,
    blockedSenders: data.blockedSenders,
    senderRuleChanges: data.senderRuleChanges,
    senderRuleChangeMessages: data.senderRuleChangeMessages,
    senderRuleChangeMerges: data.senderRuleChangeMerges,
    drafts: data.drafts,
    threadMerges: data.threadMerges,
    threadMergeMembers: data.threadMergeMembers,
  }
}
