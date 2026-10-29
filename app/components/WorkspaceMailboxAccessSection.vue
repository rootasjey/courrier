<template>
  <section class="workspace-section" aria-labelledby="workspace-mailbox-access-title">
    <h2 id="workspace-mailbox-access-title">{{ $t('workspace.mailboxAccessTitle') }}</h2>
    <p class="workspace-section-description">{{ $t('workspace.mailboxAccessDescription') }}</p>
    <p v-if="truncated.mailboxes || truncated.members || truncated.grants" class="workspace-notice" role="status">
      {{ $t('workspace.mailboxAccessTruncated') }}
    </p>
    <p v-if="notice" class="workspace-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
    <NuxtLink v-if="showMfaLink" class="workspace-mfa-link" :to="{ path: '/mfa', query: { redirect: '/workspace' } }">
      {{ $t('workspace.verifyMfa') }}
    </NuxtLink>

    <p v-if="loading" class="workspace-state" role="status">{{ $t('workspace.loadingMailboxAccess') }}</p>
    <template v-else>
      <form class="access-form" @submit.prevent="grantAccess">
        <label>
          <span>{{ $t('workspace.mailbox') }}</span>
          <select v-model="selectedMailboxId" :disabled="busy || !mailboxes.length" required>
            <option value="" disabled>{{ $t('workspace.chooseMailbox') }}</option>
            <option v-for="mailbox in mailboxes" :key="mailbox.id" :value="mailbox.id">{{ mailbox.address }}</option>
          </select>
        </label>
        <label>
          <span>{{ $t('workspace.member') }}</span>
          <select v-model="selectedUserId" :disabled="busy || !availableMembers.length" required>
            <option value="" disabled>{{ $t('workspace.chooseMember') }}</option>
            <option v-for="member in availableMembers" :key="member.user_id" :value="member.user_id">
              {{ member.display_name ? `${member.display_name} · ${member.email}` : member.email }}
            </option>
          </select>
        </label>
        <button class="workspace-primary" type="submit" :disabled="busy || !selectedMailboxId || !selectedUserId">
          {{ busy ? $t('workspace.sending') : $t('workspace.grantMailboxAccess') }}
        </button>
      </form>

      <div class="workspace-table-wrap workspace-desktop-list">
        <table>
          <thead><tr><th>{{ $t('workspace.mailbox') }}</th><th>{{ $t('workspace.member') }}</th><th>{{ $t('workspace.role') }}</th><th>{{ $t('workspace.action') }}</th></tr></thead>
          <tbody>
            <tr v-for="grant in selectedGrants" :key="`${grant.mailbox_id}:${grant.user_id}`">
              <td>{{ selectedMailbox?.address }}</td>
              <td>{{ memberById.get(grant.user_id)?.email || grant.user_id }}</td>
              <td>{{ memberById.get(grant.user_id)?.role ? $t(`workspace.roles.${memberById.get(grant.user_id)?.role}`) : '' }}</td>
              <td>
                <button v-if="canManageMember(memberById.get(grant.user_id))" class="workspace-revoke" type="button" :disabled="busy" @click="grantToRevoke = grant">
                  {{ $t('workspace.revokeMailboxAccess') }}
                </button>
                <span v-else class="workspace-member-protected">{{ memberById.get(grant.user_id)?.role === 'owner' ? $t('workspace.ownerProtected') : $t('workspace.mailboxAccessAdminProtected') }}</span>
              </td>
            </tr>
            <tr v-if="!selectedGrants.length"><td colspan="4" class="workspace-empty">{{ $t('workspace.noMailboxGrants') }}</td></tr>
          </tbody>
        </table>
      </div>
      <p v-if="!mailboxes.length" class="workspace-empty-card">{{ $t('workspace.noActiveMailboxes') }}</p>
    </template>

    <NDialog :open="Boolean(grantToRevoke)" @update:open="(open: boolean) => { if (!open && !busy) grantToRevoke = null }">
      <NDialogContent class="workspace-confirm-dialog">
        <NDialogHeader>
          <NDialogTitle>{{ $t('workspace.revokeMailboxAccess') }}</NDialogTitle>
          <NDialogDescription>{{ $t('workspace.revokeMailboxAccessDescription', {
            email: memberById.get(grantToRevoke?.user_id || '')?.email || '',
            mailbox: mailboxes.find(mailbox => mailbox.id === grantToRevoke?.mailbox_id)?.address || '',
          }) }}</NDialogDescription>
        </NDialogHeader>
        <div class="workspace-dialog-actions">
          <button class="workspace-secondary" type="button" :disabled="busy" @click="grantToRevoke = null">{{ $t('common.cancel') }}</button>
          <button class="workspace-danger" type="button" :disabled="busy" @click="revokeAccess">
            {{ busy ? $t('workspace.sending') : $t('workspace.revokeMailboxAccess') }}
          </button>
        </div>
      </NDialogContent>
    </NDialog>
  </section>
</template>

<script setup lang="ts">
defineProps<{ isOwner: boolean }>()

type Mailbox = { id: string, address: string }
type Member = { user_id: string, email: string, display_name: string | null, role: string }
type Grant = { mailbox_id: string, user_id: string }
type MailboxAccess = {
  mailboxes: Mailbox[], members: Member[], grants: Grant[],
  truncated: { mailboxes: boolean, members: boolean, grants: boolean },
}

const { $t } = useI18n()
const mailboxes = ref<Mailbox[]>([])
const members = ref<Member[]>([])
const grants = ref<Grant[]>([])
const truncated = ref({ mailboxes: false, members: false, grants: false })
const selectedMailboxId = ref('')
const selectedUserId = ref('')
const grantToRevoke = ref<Grant | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const showMfaLink = ref(false)

const selectedMailbox = computed(() => mailboxes.value.find(mailbox => mailbox.id === selectedMailboxId.value) || null)
const memberById = computed(() => new Map(members.value.map(member => [member.user_id, member])))
const selectedGrants = computed(() => grants.value.filter(grant => grant.mailbox_id === selectedMailboxId.value))
const availableMembers = computed(() => {
  const granted = new Set(selectedGrants.value.map(grant => grant.user_id))
  return members.value.filter(member => !granted.has(member.user_id) && (isOwner || member.role !== 'admin'))
})

function canManageMember(member: Member | undefined) {
  return Boolean(member && member.role !== 'owner' && (isOwner || member.role !== 'admin'))
}

async function loadAccess() {
  loading.value = true
  try {
    const result = await $fetch<MailboxAccess>('/api/workspace/mailbox-access')
    mailboxes.value = result.mailboxes
    members.value = result.members
    grants.value = result.grants
    truncated.value = result.truncated
    if (!mailboxes.value.some(mailbox => mailbox.id === selectedMailboxId.value)) selectedMailboxId.value = mailboxes.value[0]?.id || ''
    if (!availableMembers.value.some(member => member.user_id === selectedUserId.value)) selectedUserId.value = availableMembers.value[0]?.user_id || ''
  } catch {
    error.value = $t('workspace.mailboxAccessLoadError')
  } finally {
    loading.value = false
  }
}

watch(selectedMailboxId, () => {
  if (!availableMembers.value.some(member => member.user_id === selectedUserId.value)) selectedUserId.value = availableMembers.value[0]?.user_id || ''
})

onMounted(loadAccess)

async function grantAccess() {
  if (busy.value || !selectedMailboxId.value || !selectedUserId.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  showMfaLink.value = false
  try {
    await $fetch('/api/workspace/mailbox-access', {
      method: 'POST', body: { mailboxId: selectedMailboxId.value, userId: selectedUserId.value },
    })
    notice.value = $t('workspace.mailboxAccessGranted')
    await loadAccess()
  } catch (cause) {
    error.value = statusCode(cause) === 403 ? $t('workspace.mfaRequired') : $t('workspace.mailboxAccessError')
    showMfaLink.value = statusCode(cause) === 403
  } finally {
    busy.value = false
  }
}

async function revokeAccess() {
  const target = grantToRevoke.value
  if (busy.value || !target) return
  busy.value = true
  error.value = ''
  notice.value = ''
  showMfaLink.value = false
  try {
    await $fetch('/api/workspace/mailbox-access', { method: 'DELETE', body: target })
    grantToRevoke.value = null
    notice.value = $t('workspace.mailboxAccessRevoked')
    await loadAccess()
  } catch (cause) {
    error.value = statusCode(cause) === 403 ? $t('workspace.mfaRequired') : $t('workspace.mailboxAccessError')
    showMfaLink.value = statusCode(cause) === 403
  } finally {
    busy.value = false
  }
}

function statusCode(cause: unknown) {
  if (!cause || typeof cause !== 'object') return 0
  const value = cause as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  return Number(value.statusCode || value.status || value.response?.status || 0)
}
</script>

<style scoped>
.access-form { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto; align-items: end; gap: 12px; margin: 16px 0 20px; }
.access-form label { display: grid; gap: 6px; color: var(--ink); font-size: 11px; font-weight: 600; }
.access-form select { min-width: 0; min-height: 38px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; }
.workspace-table-wrap table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
.workspace-table-wrap th { padding: 0 12px 10px; color: var(--quiet); font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.workspace-table-wrap td { padding: 12px; border-top: 1px solid var(--line); color: var(--muted); vertical-align: middle; }
.workspace-table-wrap td:first-child, .workspace-table-wrap th:first-child { padding-left: 0; }
.workspace-empty { padding: 26px 12px !important; color: var(--quiet) !important; text-align: center; }
.workspace-notice, .workspace-error { margin: 0 0 12px; font-size: 12px; line-height: 1.5; }
.workspace-notice { color: var(--accent); }
.workspace-error { color: var(--error); }
.workspace-mfa-link { display: inline-block; margin: 0 0 12px; color: var(--accent); font-size: 12px; font-weight: 650; }
.workspace-state { padding: 24px; color: var(--muted); text-align: center; }
.workspace-primary, .workspace-secondary { min-height: 38px; padding: 0 13px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
.workspace-primary { border-color: var(--accent); background: var(--accent); color: white; }
.workspace-primary:disabled, .workspace-secondary:disabled, .workspace-revoke:disabled, .workspace-danger:disabled { cursor: wait; opacity: .6; }
.workspace-revoke, .workspace-danger { padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px; background: transparent; color: var(--ink); font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.workspace-danger { border-color: var(--error); color: var(--error); }
.workspace-member-protected { color: var(--quiet); font-size: 10px; }
.workspace-empty-card { color: var(--quiet); font-size: 11px; }
.workspace-confirm-dialog { width: min(100% - 32px, 430px); padding: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow); }
.workspace-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.workspace-confirm-dialog :deep([data-slot="dialog-title"]) { margin: 0; font-size: 17px; font-weight: 680; }
.workspace-confirm-dialog :deep([data-slot="dialog-description"]) { margin-top: 8px; color: var(--muted); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .access-form { grid-template-columns: 1fr; } }
</style>
