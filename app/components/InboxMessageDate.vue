<template>
  <span class="inbox-message-date-control">
    <span class="inbox-message-date-desktop">
      <NTooltip :content="absoluteDate">
        <time :datetime="timestamp">{{ relativeDate }}</time>
      </NTooltip>
    </span>
    <span class="inbox-message-date-mobile">
      <NDrawer
        :title="$t('mail.messageDate')"
        :description="absoluteDate"
        direction="bottom"
        :modal="true"
        :dismissible="true"
        :should-scale-background="false"
        :una="{ drawerContent: 'mail-mobile-drawer-content z-[120]', drawerOverlay: 'mail-mobile-drawer-overlay z-[119]', drawerHeader: 'mail-mobile-drawer-header', drawerTitle: 'mail-mobile-drawer-title', drawerDescription: 'mail-mobile-drawer-description inbox-message-date-drawer-description', drawerFooter: 'mail-mobile-drawer-footer' }"
      >
        <template #trigger>
          <button class="inbox-message-mobile-date" type="button" :aria-label="$t('mail.showExactDate', { date: absoluteDate })">
            <time :datetime="timestamp">{{ relativeDate }}</time>
          </button>
        </template>
        <template #footer>
          <NDrawerClose as-child>
            <button class="mail-mobile-drawer-close" type="button">{{ $t('common.close') }}</button>
          </NDrawerClose>
        </template>
      </NDrawer>
    </span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  timestamp: string
  relativeDate: string
  absoluteDate: string
}>()

const { $t } = useI18n()
</script>
