<template>
  <WorkspaceManagementView />
</template>

<script setup lang="ts">
import WorkspaceManagementView from '~/components/WorkspaceManagementView.vue'

const { $t } = useI18n()

definePageMeta({ pageTransition: false })
useSeoMeta({ title: () => `${$t('workspace.title')} — Courrier` })
</script>
