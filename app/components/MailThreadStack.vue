<template>
  <section
    class="mail-stack set-aside-stack"
    :class="[
      kind === 'reply-later' ? 'reply-later-stack' : undefined,
      { 'is-expanded': expanded, 'is-paired': paired },
    ]"
    :data-stack-kind="kind"
    :style="{ '--set-aside-expanded-height': expandedHeight }"
    :aria-label="$t(kind === 'set-aside' ? 'mail.setAsideStackLabel' : 'mail.replyLaterStackLabel')"
  >
    <div class="set-aside-stack-stage">
      <div :id="`${kind}-stack-expanded`" class="set-aside-stack-expanded" role="group" :aria-label="$t(expanded ? expandedLabel : collapsedLabel)">
        <div class="set-aside-stack-cards" :class="{ 'is-expanded': expanded }">
          <button
            v-for="(thread, index) in previewThreads"
            :key="thread.id"
            class="set-aside-stack-card"
            :class="[
              kind === 'reply-later' ? 'reply-later-stack-card' : undefined,
              { 'is-front-card': index === 0 },
            ]"
            type="button"
            :aria-label="!expanded && index === 0 ? $t(expandLabel) : undefined"
            :aria-hidden="!expanded && index > 0 ? 'true' : undefined"
            :tabindex="!expanded && index > 0 ? -1 : undefined"
            :style="{
              '--stack-index': index,
              '--stack-rotation': `${index % 2 ? 0.15 : -0.1}deg`,
              '--stack-offset': `${index % 2 ? 3 : -2}px`,
              zIndex: previewThreads.length - index + 1,
            }"
            @click="$emit('select', thread)"
          >
            <MailSenderAvatar class="set-aside-stack-avatar" :initials="thread.latest.initials" :color="thread.latest.color" v-bind="avatarFor(thread.latest)" />
            <span class="set-aside-stack-copy">
              <strong>{{ thread.subject }}</strong>
              <span>{{ thread.latest.sender }} · {{ thread.latest.preview }}</span>
            </span>
            <time :datetime="thread.latest.timestamp" :title="absoluteDate(thread.latest.timestamp)">{{ relativeDate(thread.latest.timestamp) }}</time>
            <span v-if="!expanded && index === 0" class="set-aside-stack-count" :class="kind === 'reply-later' ? 'reply-later-stack-count' : undefined">{{ totalCount }}</span>
          </button>
        </div>
        <NuxtLink
          class="set-aside-stack-all"
          :class="[
            kind === 'reply-later' ? 'reply-later-stack-all' : undefined,
            { 'is-visible': expanded },
          ]"
          :aria-hidden="!expanded ? 'true' : undefined"
          :tabindex="expanded ? undefined : -1"
          :to="mailboxPath(kind === 'set-aside' ? 'Set Aside' : 'Reply Later')"
        >
          {{ $t(kind === 'set-aside' ? 'mail.viewSetAside' : 'mail.viewReplyLater') }} <span aria-hidden="true">→</span>
        </NuxtLink>
      </div>
    </div>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ $t(expanded ? expandedLabel : collapsedLabel) }}.</span>
  </section>
</template>

<script setup lang="ts">
import { mailboxPath } from '~/utils/mailbox-routing'

type StackKind = 'set-aside' | 'reply-later'

type StackMessage = {
  initials: string
  color: string
  sender: string
  preview: string
  timestamp: string
}

type StackThread = {
  id: string
  subject: string
  latest: StackMessage
}

const props = defineProps<{
  kind: StackKind
  previewThreads: StackThread[]
  totalCount: number
  expanded: boolean
  paired: boolean
  expandedHeight: string
  avatarFor: (message: StackMessage) => { avatarUrl?: string | null, logoUrl?: string | null }
  relativeDate: (timestamp: string) => string
  absoluteDate: (timestamp: string) => string
}>()

defineEmits<{
  select: [thread: StackThread]
}>()

const { $t } = useI18n()
const expandLabel = props.kind === 'set-aside' ? 'mail.expandSetAsideStack' : 'mail.expandReplyLaterStack'
const expandedLabel = props.kind === 'set-aside' ? 'mail.setAsideStackExpanded' : 'mail.replyLaterStackExpanded'
const collapsedLabel = props.kind === 'set-aside' ? 'mail.setAsideStackCollapsed' : 'mail.replyLaterStackCollapsed'
</script>
