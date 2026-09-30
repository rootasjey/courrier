<script setup lang="ts">
import MailView from '~/components/MailView.vue'
import { mailboxBySlug, mailboxPath } from '~/utils/mailbox-routing'

const route = useRoute()
const segments = Array.isArray(route.params.segments) ? route.params.segments : [route.params.segments]
const mailbox = mailboxBySlug(segments[0])
const isMailboxRoute = segments.length === 1
const isThreadRoute = segments.length === 3 && segments[1] === 'threads' && Boolean(segments[2])

if (!mailbox || (!isMailboxRoute && !isThreadRoute)) {
  await navigateTo(mailboxPath('Imbox'), { replace: true })
}
</script>

<template>
  <MailView />
</template>
