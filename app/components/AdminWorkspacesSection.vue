<template>
  <section class="admin-section" aria-labelledby="admin-workspaces-heading">
    <h2 id="admin-workspaces-heading">{{ $t('admin.workspaces') }}</h2>
    <p class="admin-section-description">{{ $t('admin.createWorkspaceDescription') }}</p>
    <p v-if="error" class="admin-access-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="admin-access-notice" role="status">{{ notice }}</p>

    <form class="admin-workspace-create" @submit.prevent="createWorkspace">
      <label class="admin-access-field">
        <span>{{ $t('admin.workspaceName') }}</span>
        <input v-model="name" type="text" maxlength="80" autocomplete="off" :placeholder="$t('admin.workspaceNamePlaceholder')" :disabled="busy" required>
      </label>
      <label class="admin-access-field">
        <span>{{ $t('admin.initialWorkspaceOwner') }}</span>
        <input v-model="ownerEmail" type="email" maxlength="254" autocomplete="email" autocapitalize="none" spellcheck="false" :placeholder="$t('admin.workspaceOwnerEmailPlaceholder')" :disabled="busy" required>
      </label>
      <button class="admin-access-action" type="submit" :disabled="busy || !name.trim() || !ownerEmail.trim()">
        {{ busy ? $t('admin.creatingWorkspace') : $t('admin.createWorkspace') }}
      </button>
    </form>

    <div class="admin-table-wrap">
      <table>
        <thead><tr><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.initialWorkspaceOwner') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.domains') }}</th><th>{{ $t('admin.mailboxes') }}</th><th>{{ $t('admin.members') }}</th><th>{{ $t('admin.created') }}</th></tr></thead>
        <tbody>
          <tr v-for="workspace in workspaces" :key="workspace.id">
            <td><strong>{{ workspace.name }}</strong><small>{{ workspace.id }}</small></td>
            <td>{{ workspace.owner_email || '—' }}</td>
            <td><span class="admin-status" :class="`is-${workspace.status}`">{{ statusLabel(workspace.status) }}</span></td>
            <td>{{ workspace.domain_count }}</td><td>{{ workspace.mailbox_count }}</td><td>{{ workspace.member_count }}</td><td>{{ formatDate(workspace.created_at) }}</td>
          </tr>
          <tr v-if="!workspaces.length"><td colspan="7" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
type Workspace = { id: string, name: string, status: string, created_at: string, owner_email: string | null, domain_count: number, mailbox_count: number, member_count: number }
type AdminFetch = <T>(url: string, options?: { method?: string, body?: unknown }) => Promise<T>

const props = defineProps<{
  workspaces: Workspace[]
  adminFetch: AdminFetch
  formatDate: (value: string) => string
  statusLabel: (value: string) => string
}>()
const emit = defineEmits<{ refresh: [] }>()
const { $t } = useI18n()

const name = ref('')
const ownerEmail = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')

async function createWorkspace() {
  if (!name.value.trim() || !ownerEmail.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''

  try {
    const result = await props.adminFetch<{ name: string, ownerEmail: string }>('/api/admin/workspaces', {
      method: 'POST',
      body: { name: name.value, ownerEmail: ownerEmail.value },
    })
    name.value = ''
    ownerEmail.value = ''
    notice.value = $t('admin.workspaceCreatedNotice', { name: result.name, owner: result.ownerEmail })
    emit('refresh')
  } catch (cause) {
    const response = cause as { statusCode?: number, status?: number }
    const status = response?.statusCode ?? response?.status
    error.value = status === 404 ? $t('admin.workspaceOwnerNotFound')
      : status === 409 ? $t('admin.workspaceOwnerChanged')
        : status === 400 ? $t('admin.workspaceInvalid')
          : $t('admin.workspaceCreateError')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.admin-workspace-create {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr) auto;
  align-items: end;
  gap: 12px;
  margin-bottom: 20px;
}

.admin-workspace-create input {
  width: 100%;
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}

.admin-workspace-create input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 760px) {
  .admin-workspace-create {
    grid-template-columns: 1fr;
  }
}
</style>
