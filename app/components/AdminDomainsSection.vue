<template>
  <section class="admin-section" aria-labelledby="admin-domains-heading">
    <h2 id="admin-domains-heading">{{ $t('admin.domains') }}</h2>
    <p class="admin-section-description">{{ $t('admin.domainVerificationDescription') }}</p>
    <p v-if="domainError" class="admin-access-error" role="alert">{{ domainError }}</p>
    <p v-if="domainNotice" class="admin-access-notice" role="status">{{ domainNotice }}</p>
    <div class="admin-domain-controls">
      <label class="admin-access-field">
        <span>{{ $t('admin.workspace') }}</span>
        <select v-model="selectedWorkspaceId" :disabled="domainBusy || !activeWorkspaces.length">
          <option value="">{{ $t('admin.chooseWorkspace') }}</option>
          <option v-for="workspace in activeWorkspaces" :key="workspace.id" :value="workspace.id">
            {{ workspace.name }}
          </option>
        </select>
      </label>
      <label class="admin-access-field">
        <span>{{ $t('admin.domain') }}</span>
        <input v-model="domainInput" type="text" :placeholder="$t('admin.domainPlaceholder')" :disabled="domainBusy" autocomplete="off" spellcheck="false">
      </label>
      <button class="admin-access-action" type="button" :disabled="domainBusy || !selectedWorkspaceId || !domainInput.trim()" @click="addDomain">
        {{ domainBusy ? $t('admin.savingDomain') : $t('admin.addDomain') }}
      </button>
    </div>

    <div v-if="domainChallenge" class="admin-domain-challenge" aria-live="polite">
      <div class="admin-domain-challenge-heading">
        <div>
          <h3>{{ $t('admin.dnsRecordTitle', { domain: domainChallenge.domain }) }}</h3>
          <p>{{ $t('admin.dnsRecordDescription') }} <strong>{{ formatDate(domainChallenge.expiresAt) }}</strong></p>
        </div>
        <button class="admin-domain-dismiss" type="button" :aria-label="$t('admin.hideDnsRecord')" @click="domainChallenge = null">×</button>
      </div>
      <dl class="admin-domain-record">
        <div><dt>{{ $t('admin.dnsRecordType') }}</dt><dd><code>TXT</code></dd></div>
        <div><dt>{{ $t('admin.dnsRecordName') }}</dt><dd><code>{{ domainChallenge.recordName }}</code></dd></div>
        <div><dt>{{ $t('admin.dnsRecordValue') }}</dt><dd><code>{{ domainChallenge.recordValue }}</code></dd></div>
      </dl>
      <div class="admin-domain-challenge-actions">
        <button class="admin-access-action" type="button" :disabled="domainBusy" @click="verifyDomain(domainChallenge)">
          {{ domainBusy ? $t('admin.checkingDns') : $t('admin.checkDns') }}
        </button>
      </div>
    </div>

    <div class="admin-table-wrap">
      <table>
        <thead><tr><th>{{ $t('admin.domain') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.verification') }}</th><th>{{ $t('admin.mailboxes') }}</th><th>{{ $t('admin.verifiedAt') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
        <tbody>
          <tr v-for="domain in domains" :key="domain.id">
            <td><strong>{{ domain.domain }}</strong></td><td>{{ domain.workspace_name }}</td>
            <td><span class="admin-status" :class="`is-${domain.verification_status}`">{{ statusLabel(domain.verification_status) }}</span></td>
            <td>{{ domain.mailbox_count }}</td><td>{{ domain.verified_at ? formatDate(domain.verified_at) : '—' }}</td>
            <td>
              <div v-if="domain.verification_status === 'pending' || domain.verification_status === 'legacy_unverified'" class="admin-domain-row-actions">
                <button class="admin-membership-action is-reactivate" type="button" :disabled="domainBusy" @click="prepareDomainChallenge(domain)">
                  {{ $t(domain.verification_status === 'pending' ? 'admin.configureDns' : 'admin.verifyLegacyDomain') }}
                </button>
                <button v-if="domain.verification_status === 'pending'" class="admin-membership-action is-suspend" type="button" :disabled="domainBusy || domain.mailbox_count > 0" @click="domainToRemove = domain">
                  {{ $t('admin.removePendingDomain') }}
                </button>
              </div>
              <span v-else class="admin-access-protected">—</span>
            </td>
          </tr>
          <tr v-if="!domains.length"><td colspan="6" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
        </tbody>
      </table>
    </div>

    <NDialog
      :open="Boolean(domainToRemove)"
      :title="$t('admin.removePendingDomain')"
      :description="$t('admin.removePendingDomainDescription', { domain: domainToRemove?.domain || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !domainBusy) domainToRemove = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.removePendingDomain') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.removePendingDomainDescription', { domain: domainToRemove?.domain || '' }) }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="domainBusy" @click="domainToRemove = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="domainBusy" @click="removePendingDomain">
            {{ domainBusy ? $t('admin.removingDomain') : $t('admin.removePendingDomain') }}
          </button>
        </div>
      </template>
    </NDialog>
  </section>
</template>

<script setup lang="ts">
import { watch } from 'vue'

type DomainWorkspace = { id: string, name: string }
type AdminDomain = { id: string, workspace_id: string, workspace_name: string, domain: string, verification_status: string, verified_at: string | null, mailbox_count: number }
type DomainChallenge = { domainId: string, domain: string, recordName: string, recordValue: string, expiresAt: string }
type AdminRequest = <T>(request: string, options?: Parameters<typeof $fetch>[1]) => Promise<T>

const props = defineProps<{
  activeWorkspaces: DomainWorkspace[]
  domains: AdminDomain[]
  adminFetch: AdminRequest
  formatDate: (value: string) => string
  statusLabel: (status: string) => string
}>()
const emit = defineEmits<{ refresh: [] }>()
const { $t } = useI18n()

const selectedWorkspaceId = ref('')
const domainInput = ref('')
const domainBusy = ref(false)
const domainError = ref('')
const domainNotice = ref('')
const domainChallenge = ref<DomainChallenge | null>(null)
const domainToRemove = ref<AdminDomain | null>(null)

watch(() => props.activeWorkspaces, (workspaces) => {
  if (!workspaces.some(workspace => workspace.id === selectedWorkspaceId.value)) {
    selectedWorkspaceId.value = workspaces[0]?.id ?? ''
  }
}, { immediate: true })

function statusCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { statusCode?: number, status?: number }
  return value.statusCode ?? value.status
}

async function addDomain() {
  if (domainBusy.value || !selectedWorkspaceId.value || !domainInput.value.trim()) return
  domainBusy.value = true
  domainError.value = ''
  domainNotice.value = ''
  try {
    await props.adminFetch('/api/admin/domains', {
      method: 'POST',
      body: { workspaceId: selectedWorkspaceId.value, domain: domainInput.value },
    })
    domainNotice.value = $t('admin.domainAddedNotice')
    domainInput.value = ''
    emit('refresh')
  } catch (error) {
    const status = statusCode(error)
    domainError.value = $t(status === 409 ? 'admin.domainAlreadyAdded' : status === 400 ? 'admin.domainInvalid' : 'admin.domainSaveError')
  } finally {
    domainBusy.value = false
  }
}

async function prepareDomainChallenge(domain: AdminDomain) {
  if (domainBusy.value) return
  domainBusy.value = true
  domainError.value = ''
  domainNotice.value = ''
  try {
    domainChallenge.value = await props.adminFetch<DomainChallenge>(`/api/admin/domains/${encodeURIComponent(domain.id)}/challenge`, { method: 'POST' })
  } catch {
    domainError.value = $t('admin.domainChallengeError')
  } finally {
    domainBusy.value = false
  }
}

async function verifyDomain(challenge: DomainChallenge) {
  if (domainBusy.value) return
  domainBusy.value = true
  domainError.value = ''
  domainNotice.value = ''
  try {
    const result = await props.adminFetch<{ verified: boolean }>(`/api/admin/domains/${encodeURIComponent(challenge.domainId)}/verify`, { method: 'POST' })
    if (!result.verified) {
      domainNotice.value = $t('admin.domainDnsNotVisible')
      return
    }
    domainChallenge.value = null
    domainNotice.value = $t('admin.domainVerifiedNotice')
    emit('refresh')
  } catch (error) {
    domainError.value = $t(statusCode(error) === 410 ? 'admin.domainChallengeExpired' : 'admin.domainVerifyError')
  } finally {
    domainBusy.value = false
  }
}

async function removePendingDomain() {
  const domain = domainToRemove.value
  if (!domain || domainBusy.value) return
  domainBusy.value = true
  domainError.value = ''
  domainNotice.value = ''
  try {
    await props.adminFetch(`/api/admin/domains/${encodeURIComponent(domain.id)}`, { method: 'DELETE' })
    if (domainChallenge.value?.domainId === domain.id) domainChallenge.value = null
    domainToRemove.value = null
    domainNotice.value = $t('admin.domainRemovedNotice')
    emit('refresh')
  } catch {
    domainError.value = $t('admin.domainRemoveError')
  } finally {
    domainBusy.value = false
  }
}
</script>
