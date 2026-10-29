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
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

type AdminDomain = { id: string, workspace_id: string, workspace_name: string, domain: string, verification_status: string }
type AdminMember = { workspace_id: string, user_id: string, email: string, display_name: string | null, role: string }
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
    const result = await props.adminFetch<{ address: string }>('/api/admin/mailboxes', {
      method: 'POST',
      body: { domainId: selectedDomain.value.id, localPart: normalizedLocalPart.value, userIds: userIds.value },
    })
    notice.value = $t('admin.mailboxCreatedNotice', { address: result.address })
    localPart.value = ''
    userIds.value = []
    emit('refresh')
  } catch (value) {
    const status = statusCode(value)
    error.value = $t(status === 409 ? 'admin.mailboxAlreadyExists' : status === 400 ? 'admin.mailboxInvalid' : 'admin.mailboxCreateError')
  } finally {
    busy.value = false
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
