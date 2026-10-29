<template>
  <section id="admin-mailbox-setup" class="admin-section" aria-labelledby="admin-mailboxes-heading">
    <h2 id="admin-mailboxes-heading">{{ $t('admin.createMailbox') }}</h2>
    <p class="admin-section-description">{{ $t('admin.createMailboxDescription') }}</p>
    <p v-if="error" class="admin-access-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="admin-access-notice" role="status">{{ notice }}</p>

    <form class="admin-domain-controls admin-mailbox-create" @submit.prevent="createMailbox">
      <label class="admin-access-field">
        <span>{{ $t('admin.verifiedDomain') }}</span>
        <select v-model="domainId" :disabled="busy || !domains.length" required>
          <option value="">{{ $t(domains.length ? 'admin.chooseVerifiedDomain' : 'admin.noVerifiedDomains') }}</option>
          <option v-for="domain in domains" :key="domain.id" :value="domain.id">
            {{ domain.domain }} — {{ domain.workspace_name }}
          </option>
        </select>
      </label>

      <label class="admin-access-field">
        <span>{{ $t('admin.mailboxLocalPart') }}</span>
        <input v-model="localPart" type="text" maxlength="64" autocomplete="off" autocapitalize="none" spellcheck="false" :disabled="busy" :placeholder="$t('admin.mailboxLocalPartPlaceholder')" required>
      </label>

      <p v-if="selectedDomain && localPart.trim()" class="admin-mailbox-preview" aria-live="polite">
        {{ $t('admin.mailboxAddressPreview') }} <strong>{{ normalizedLocalPart }}@{{ selectedDomain.domain }}</strong>
      </p>

      <fieldset class="admin-mailbox-members" :disabled="busy || !selectedDomain || !eligibleMembers.length">
        <legend>{{ $t('admin.initialMailboxAccess') }}</legend>
        <p class="admin-section-description">{{ $t('admin.initialMailboxAccessDescription') }}</p>
        <p v-if="selectedDomain" class="admin-mailbox-selection-count">{{ $t('admin.mailboxMemberSelectionCount', { count: userIds.length }) }}</p>
        <p v-if="membersTruncated && selectedDomain" class="admin-access-notice" role="status">{{ $t('admin.mailboxMembersTruncated') }}</p>
        <div v-if="eligibleMembers.length" class="admin-mailbox-member-list">
          <label v-for="member in eligibleMembers" :key="member.user_id" class="admin-mailbox-member">
            <input v-model="userIds" type="checkbox" :value="member.user_id" :disabled="userIds.length >= 100 && !userIds.includes(member.user_id)">
            <span><strong>{{ member.display_name || member.email }}</strong><small>{{ member.email }} · {{ roleLabel(member.role) }}</small></span>
          </label>
        </div>
        <p v-else class="admin-empty">{{ $t(selectedDomain ? 'admin.noEligibleMailboxMembers' : 'admin.mailboxSelectDomainFirst') }}</p>
      </fieldset>

      <button class="admin-access-action" type="submit" :disabled="!canSubmit">
        {{ busy ? $t('admin.creatingMailbox') : $t('admin.createMailbox') }}
      </button>
    </form>

    <div class="admin-mailbox-management">
      <h3>{{ $t('admin.manageMailboxes') }}</h3>
      <p v-if="mailboxLoadError" class="admin-access-error" role="alert">{{ $t('admin.mailboxLoadError') }}</p>
      <p v-else-if="mailboxesLoading" class="admin-empty" role="status">{{ $t('admin.loading') }}</p>
      <div v-else-if="mailboxes.length" class="admin-table-wrap">
        <table>
          <thead><tr><th>{{ $t('admin.mailbox') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
          <tbody>
            <tr v-for="mailbox in mailboxes" :key="mailbox.id">
              <td><strong>{{ mailbox.address }}</strong></td>
              <td>{{ mailbox.workspace_name }}</td>
              <td><span class="admin-status" :class="`is-${mailbox.status}`">{{ $t(mailbox.status === 'active' ? 'admin.active' : 'admin.suspended') }}</span></td>
              <td>
                <button v-if="mailbox.status === 'suspended' || confirmMailboxId !== mailbox.id" class="admin-membership-action" :class="mailbox.status === 'active' ? 'is-suspend' : 'is-reactivate'" type="button" :disabled="Boolean(mailboxActionId)" @click="prepareMailboxToggle(mailbox)">
                  {{ mailboxActionId === mailbox.id ? $t('admin.savingAccess') : $t(mailbox.status === 'active' ? 'admin.suspendMailbox' : 'admin.reactivateMailbox') }}
                </button>
                <div v-else class="admin-mailbox-confirm" role="group" :aria-label="$t('admin.confirmSuspendMailbox', { address: mailbox.address })">
                  <p>{{ $t('admin.confirmSuspendMailbox', { address: mailbox.address }) }}</p>
                  <button class="admin-membership-action is-suspend" type="button" :disabled="Boolean(mailboxActionId)" @click="toggleMailbox(mailbox)">{{ $t('admin.confirmMailboxAction') }}</button>
                  <button class="admin-membership-action" type="button" :disabled="Boolean(mailboxActionId)" @click="confirmMailboxId = ''">{{ $t('admin.cancelMailboxAction') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="admin-empty">{{ $t('admin.noActiveMailboxes') }}</p>
      <p v-if="mailboxActionError" class="admin-access-error" role="alert">{{ mailboxActionError }}</p>
      <p v-if="mailboxActionNotice" class="admin-access-notice" role="status">{{ mailboxActionNotice }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

type AdminDomain = { id: string, workspace_id: string, workspace_name: string, domain: string, verification_status: string }
type AdminMember = { workspace_id: string, user_id: string, email: string, display_name: string | null, role: string }
type ManagedMailbox = { id: string, workspace_id: string, workspace_name: string, domain: string, address: string, status: 'active' | 'suspended' }
type AdminRequest = <T>(request: string, options?: Parameters<typeof $fetch>[1]) => Promise<T>

const props = defineProps<{
  domains: AdminDomain[]
  members: AdminMember[]
  membersTruncated: boolean
  adminFetch: AdminRequest
  suggestedDomainId?: string | null
}>()
const emit = defineEmits<{ refresh: [] }>()
const { $t } = useI18n()

const domainId = ref('')
const localPart = ref('')
const userIds = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const notice = ref('')
const mailboxes = ref<ManagedMailbox[]>([])
const mailboxesLoading = ref(false)
const mailboxLoadError = ref(false)
const mailboxActionId = ref('')
const confirmMailboxId = ref('')
const mailboxActionError = ref('')
const mailboxActionNotice = ref('')

const selectedDomain = computed(() => props.domains.find(domain => domain.id === domainId.value) ?? null)
const eligibleMembers = computed(() => selectedDomain.value
  ? props.members.filter(member => member.workspace_id === selectedDomain.value!.workspace_id)
  : [])
const normalizedLocalPart = computed(() => localPart.value.trim().toLowerCase())
const canSubmit = computed(() => Boolean(selectedDomain.value && normalizedLocalPart.value && userIds.value.length && !busy.value))

watch(() => props.domains, (domains) => {
  if (props.suggestedDomainId && domains.some(domain => domain.id === props.suggestedDomainId)) {
    domainId.value = props.suggestedDomainId
  } else if (!domains.some(domain => domain.id === domainId.value)) {
    domainId.value = domains[0]?.id ?? ''
  }
}, { immediate: true })

watch(() => props.suggestedDomainId, (suggestedDomainId) => {
  if (suggestedDomainId && props.domains.some(domain => domain.id === suggestedDomainId)) {
    domainId.value = suggestedDomainId
  }
})

watch(domainId, () => { userIds.value = [] })

onMounted(loadMailboxes)

function roleLabel(role: string) {
  const key = `admin.role${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`
  return ['owner', 'admin', 'member', 'viewer'].includes(role) ? $t(key) : role
}

function statusCode(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const response = value as { statusCode?: number, status?: number }
  return response.statusCode ?? response.status
}

async function createMailbox() {
  if (!canSubmit.value || !selectedDomain.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await props.adminFetch<{ address: string, routingStatus: 'configured' | 'manual_required' | 'conflict' }>('/api/admin/mailboxes', {
      method: 'POST',
      body: { domainId: selectedDomain.value.id, localPart: normalizedLocalPart.value, userIds: userIds.value },
    })
    notice.value = $t(result.routingStatus === 'configured'
      ? 'admin.mailboxCreatedNotice'
      : result.routingStatus === 'conflict' ? 'admin.mailboxCreatedRoutingConflictNotice' : 'admin.mailboxCreatedRoutingManualNotice',
    { address: result.address })
    localPart.value = ''
    userIds.value = []
    await loadMailboxes()
    emit('refresh')
  } catch (value) {
    const status = statusCode(value)
    error.value = $t(status === 409 ? 'admin.mailboxAlreadyExists' : status === 400 ? 'admin.mailboxInvalid' : 'admin.mailboxCreateError')
  } finally {
    busy.value = false
  }
}

async function loadMailboxes() {
  mailboxesLoading.value = true
  mailboxLoadError.value = false
  try {
    const result = await props.adminFetch<{ mailboxes: ManagedMailbox[] }>('/api/admin/mailboxes')
    mailboxes.value = Array.isArray(result.mailboxes) ? result.mailboxes : []
  } catch {
    mailboxLoadError.value = true
  } finally {
    mailboxesLoading.value = false
  }
}

function prepareMailboxToggle(mailbox: ManagedMailbox) {
  if (mailbox.status === 'active') {
    confirmMailboxId.value = mailbox.id
    mailboxActionError.value = ''
    mailboxActionNotice.value = ''
    return
  }
  void toggleMailbox(mailbox)
}

async function toggleMailbox(mailbox: ManagedMailbox) {
  if (mailboxActionId.value) return
  mailboxActionId.value = mailbox.id
  confirmMailboxId.value = ''
  mailboxActionError.value = ''
  mailboxActionNotice.value = ''
  const status = mailbox.status === 'active' ? 'suspended' : 'active'
  try {
    await props.adminFetch(`/api/admin/mailboxes/${encodeURIComponent(mailbox.id)}`, {
      method: 'PATCH',
      body: { status },
    })
    mailboxActionNotice.value = $t(status === 'suspended' ? 'admin.mailboxSuspendedNotice' : 'admin.mailboxReactivatedNotice')
    await loadMailboxes()
    emit('refresh')
  } catch (value) {
    mailboxActionError.value = statusCode(value) === 409
      ? $t(status === 'suspended' ? 'admin.mailboxManualDisableRequired' : 'admin.mailboxManualEnableRequired')
      : $t('admin.mailboxLifecycleError')
  } finally {
    mailboxActionId.value = ''
  }
}
</script>

<style scoped>
.admin-mailbox-create {
  align-items: end;
}

.admin-mailbox-preview,
.admin-mailbox-members {
  grid-column: 1 / -1;
}

.admin-mailbox-management {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}

.admin-mailbox-management h3,
.admin-mailbox-management p {
  margin: 0;
}

.admin-mailbox-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-mailbox-preview {
  margin: 0;
  color: var(--muted);
}

.admin-mailbox-selection-count {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 12px;
}

.admin-mailbox-members {
  min-width: 0;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.admin-mailbox-members legend {
  padding: 0 6px;
  font-weight: 600;
}

.admin-mailbox-member-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 8px;
}

.admin-mailbox-member {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  cursor: pointer;
}

.admin-mailbox-member input {
  margin-top: 3px;
  accent-color: var(--accent, #3b6e66);
}

.admin-mailbox-member span,
.admin-mailbox-member small {
  display: block;
}

.admin-mailbox-member small {
  margin-top: 3px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .admin-mailbox-preview,
  .admin-mailbox-members {
    grid-column: auto;
  }
}
</style>
