<template>
  <section class="admin-section" aria-labelledby="admin-domains-heading">
    <h2 id="admin-domains-heading">{{ $t('admin.domains') }}</h2>
    <p class="admin-section-description">{{ $t('admin.domainVerificationDescription') }}</p>
    <p v-if="domainError" class="admin-access-error" role="alert">{{ domainError }}</p>
    <p v-if="domainNotice" class="admin-access-notice" role="status">{{ domainNotice }}</p>
    <div class="admin-domain-controls">
      <label class="admin-access-field">
        <span>{{ $t('admin.workspace') }}</span>
        <select v-model="selectedWorkspaceId" :disabled="domainBusy || preflightBusy || !activeWorkspaces.length">
          <option value="">{{ $t('admin.chooseWorkspace') }}</option>
          <option v-for="workspace in activeWorkspaces" :key="workspace.id" :value="workspace.id">
            {{ workspace.name }}
          </option>
        </select>
      </label>
      <label class="admin-access-field">
        <span>{{ $t('admin.domain') }}</span>
        <input v-model="domainInput" type="text" :placeholder="$t('admin.domainPlaceholder')" :disabled="domainBusy || preflightBusy" autocomplete="off" spellcheck="false">
      </label>
      <div class="admin-domain-actions">
        <button class="admin-membership-action is-reactivate" type="button" :disabled="domainBusy || preflightBusy || !domainInput.trim()" @click="preflightDomain">
          {{ preflightBusy ? $t('admin.domainPreflighting') : $t('admin.domainPreflight') }}
        </button>
        <button class="admin-access-action" type="button" :disabled="domainBusy || preflightBusy || !selectedWorkspaceId || !domainInput.trim()" @click="addDomain">
          {{ domainBusy ? $t('admin.savingDomain') : $t('admin.addDomain') }}
        </button>
      </div>
    </div>

    <div v-if="domainPreflight || preflightError" class="admin-domain-challenge" aria-live="polite">
      <div class="admin-domain-challenge-heading">
        <div>
          <h3>{{ $t('admin.domainPreflightTitle', { domain: domainPreflight?.domain ?? preflightDomainName }) }}</h3>
          <p>{{ $t('admin.domainPreflightDescription') }}</p>
        </div>
        <button class="admin-domain-dismiss" type="button" :aria-label="$t('admin.hideDomainPreflight')" @click="domainPreflight = null; preflightError = ''">×</button>
      </div>
      <p v-if="preflightError" class="admin-access-error" role="alert">{{ preflightError }}</p>
      <template v-else-if="domainPreflight">
        <dl class="admin-domain-record admin-domain-readiness">
          <div>
            <dt>{{ $t('admin.mailDnsInbound') }}</dt>
            <dd>
              <span class="admin-status" :class="`is-${domainPreflight.mx.state}`">{{ $t(`admin.mailDnsState.${domainPreflight.mx.state}`) }}</span>
              <ul v-if="domainPreflight.mx.records.length"><li v-for="record in domainPreflight.mx.records" :key="`${record.priority}-${record.target}`"><code>{{ record.priority }} {{ record.target }}</code></li></ul>
              <p class="admin-domain-preflight-help">{{ $t(`admin.domainPreflightHelp.mx.${domainPreflight.mx.state}`) }}</p>
            </dd>
          </div>
          <div>
            <dt>{{ $t('admin.mailDnsSpf') }}</dt>
            <dd>
              <span class="admin-status" :class="`is-${domainPreflight.routingSpf.state}`">{{ $t(`admin.mailDnsState.${domainPreflight.routingSpf.state}`) }}</span>
              <p class="admin-domain-preflight-help">{{ $t(`admin.domainPreflightHelp.spf.${domainPreflight.routingSpf.state}`) }}</p>
            </dd>
          </div>
          <div>
            <dt>{{ $t('admin.mailDnsDkim') }}</dt>
            <dd>
              <span class="admin-status" :class="`is-${domainPreflight.routingDkim.state}`">{{ $t(`admin.mailDnsState.${domainPreflight.routingDkim.state}`) }}</span>
              <p class="admin-domain-preflight-help">{{ $t(`admin.domainPreflightHelp.dkim.${domainPreflight.routingDkim.state}`) }}</p>
            </dd>
          </div>
        </dl>
        <p class="admin-domain-safety-note">{{ $t('admin.domainPreflightSafetyNote') }}</p>
      </template>
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
              <div class="admin-domain-row-actions">
                <button v-if="domain.verification_status === 'verified'" class="admin-membership-action is-reactivate" type="button" :disabled="readinessBusy" @click="checkReadiness(domain)">
                  {{ readinessBusy && readiness?.domainId === domain.id ? $t('admin.checkingMailDns') : $t('admin.checkMailDns') }}
                </button>
                <template v-else-if="domain.verification_status === 'pending' || domain.verification_status === 'legacy_unverified'">
                  <button class="admin-membership-action is-reactivate" type="button" :disabled="domainBusy" @click="prepareDomainChallenge(domain)">
                    {{ $t(domain.verification_status === 'pending' ? 'admin.configureDns' : 'admin.verifyLegacyDomain') }}
                  </button>
                  <button v-if="domain.verification_status === 'pending'" class="admin-membership-action is-suspend" type="button" :disabled="domainBusy || domain.mailbox_count > 0" @click="domainToRemove = domain">
                    {{ $t('admin.removePendingDomain') }}
                  </button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="!domains.length"><td colspan="6" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="readiness || readinessError" class="admin-domain-challenge" aria-live="polite">
      <div class="admin-domain-challenge-heading">
        <div>
          <h3>{{ $t('admin.mailDnsTitle', { domain: readiness?.domain ?? readinessDomain }) }}</h3>
          <p>{{ $t('admin.mailDnsDescription') }}</p>
        </div>
        <button class="admin-domain-dismiss" type="button" :aria-label="$t('admin.hideMailDns')" @click="readiness = null; readinessError = ''">×</button>
      </div>
      <p v-if="readinessError" class="admin-access-error" role="alert">{{ readinessError }}</p>
      <template v-else-if="readiness">
        <ol class="admin-domain-onboarding-steps" :aria-label="$t('admin.domainOnboardingSteps')">
          <li class="is-complete">
            <span>1</span><div><strong>{{ $t('admin.domainOnboardingOwnership') }}</strong><small>{{ $t('admin.domainOnboardingVerified') }}</small></div>
          </li>
          <li :class="`is-${readiness.mx.state}`">
            <span>2</span><div><strong>{{ $t('admin.domainOnboardingMx') }}</strong><small>{{ $t(`admin.mailDnsState.${readiness.mx.state}`) }}</small></div>
          </li>
          <li :class="`is-${routingSummaryStyle(readiness.routingRules)}`">
            <span>3</span><div><strong>{{ $t('admin.domainOnboardingRouting') }}</strong><small>{{ $t(`admin.mailDnsRoutingSummary.${routingSummaryState(readiness.routingRules)}`) }}</small></div>
          </li>
          <li>
            <span>4</span><div><strong>{{ $t('admin.domainOnboardingMailbox') }}</strong><small>{{ $t('admin.domainOnboardingMailboxDescription') }}</small></div>
          </li>
        </ol>
        <dl class="admin-domain-record admin-domain-readiness">
          <div>
            <dt>{{ $t('admin.mailDnsInbound') }}</dt>
            <dd><span class="admin-status" :class="`is-${readiness.mx.state}`">{{ $t(`admin.mailDnsState.${readiness.mx.state}`) }}</span>
              <ul v-if="readiness.mx.records.length"><li v-for="record in readiness.mx.records" :key="`${record.priority}-${record.target}`"><code>{{ record.priority }} {{ record.target }}</code></li></ul>
            </dd>
          </div>
          <div>
            <dt>{{ $t('admin.mailDnsRouting') }}</dt>
            <dd>
              <span class="admin-status" :class="`is-${routingSummaryStyle(readiness.routingRules)}`">{{ $t(`admin.mailDnsRoutingSummary.${routingSummaryState(readiness.routingRules)}`) }}</span>
              <ul v-if="readiness.routingRules.length" class="admin-domain-routing-rules">
                <li v-for="rule in readiness.routingRules" :key="rule.address">
                  <code>{{ rule.address }}</code>
                  <span class="admin-status" :class="`is-${routingStateStyle(rule.state)}`">{{ $t(`admin.mailDnsRoutingState.${rule.state}`) }}</span>
                </li>
              </ul>
            </dd>
          </div>
        </dl>
        <h4 class="admin-domain-subheading">{{ $t('admin.mailDnsRoutingAuth') }}</h4>
        <p class="admin-domain-routing-note">{{ $t('admin.mailDnsRoutingAuthDescription') }}</p>
        <dl class="admin-domain-record admin-domain-readiness">
          <div><dt>{{ $t('admin.mailDnsSpf') }}</dt><dd><span class="admin-status" :class="`is-${readiness.routingSpf.state}`">{{ $t(`admin.mailDnsState.${readiness.routingSpf.state}`) }}</span></dd></div>
          <div><dt>{{ $t('admin.mailDnsDkim') }}</dt><dd><span class="admin-status" :class="`is-${readiness.routingDkim.state}`">{{ $t(`admin.mailDnsState.${readiness.routingDkim.state}`) }}</span></dd></div>
        </dl>
        <p class="admin-domain-safety-note">{{ $t('admin.mailDnsSafetyNote') }}</p>
        <div class="admin-domain-readiness-links">
          <a class="admin-domain-doc-link" href="https://developers.cloudflare.com/email-service/get-started/route-emails/" target="_blank" rel="noopener noreferrer">{{ $t('admin.mailDnsCloudflareGuide') }}</a>
          <a class="admin-domain-mailbox-link" href="#admin-mailboxes-heading" @click="emit('selectMailboxDomain', readiness.domainId)">{{ $t('admin.domainOnboardingGoToMailbox') }}</a>
        </div>
      </template>
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
type DnsReadinessState = 'configured' | 'missing' | 'mixed' | 'other_provider' | 'unavailable' | 'conflict' | 'present' | 'no_mailboxes'
type MailboxRoutingState = 'configured' | 'disabled' | 'other_target' | 'missing' | 'unavailable'
type DomainPreflight = {
  domain: string
  checkedAt: string
  mx: DomainReadiness['mx']
  routingSpf: DomainReadiness['routingSpf']
  routingDkim: DomainReadiness['routingDkim']
}
type DomainReadiness = {
  domainId: string
  domain: string
  checkedAt: string
  mx: { state: DnsReadinessState, records: { target: string, priority: number | null }[] }
  routingSpf: { state: DnsReadinessState }
  routingDkim: { state: DnsReadinessState }
  routingRules: { address: string, state: MailboxRoutingState }[]
}
type AdminRequest = <T>(request: string, options?: Parameters<typeof $fetch>[1]) => Promise<T>

const props = defineProps<{
  activeWorkspaces: DomainWorkspace[]
  domains: AdminDomain[]
  adminFetch: AdminRequest
  formatDate: (value: string) => string
  statusLabel: (status: string) => string
}>()
const emit = defineEmits<{ refresh: [], selectMailboxDomain: [domainId: string] }>()
const { $t } = useI18n()

function routingSummaryState(rules: DomainReadiness['routingRules']): DnsReadinessState {
  if (!rules.length) return 'no_mailboxes'
  if (rules.some(rule => rule.state === 'unavailable')) return 'unavailable'
  if (rules.every(rule => rule.state === 'configured')) return 'configured'
  if (rules.some(rule => rule.state === 'configured')) return 'mixed'
  if (rules.some(rule => rule.state === 'disabled' || rule.state === 'other_target')) return 'conflict'
  return 'missing'
}

function routingSummaryStyle(rules: DomainReadiness['routingRules']) {
  const state = routingSummaryState(rules)
  return state === 'no_mailboxes' ? 'pending' : state
}

function routingStateStyle(state: MailboxRoutingState) {
  return state === 'disabled' || state === 'other_target' ? 'conflict' : state
}

const selectedWorkspaceId = ref('')
const domainInput = ref('')
const domainBusy = ref(false)
const domainError = ref('')
const domainNotice = ref('')
const domainChallenge = ref<DomainChallenge | null>(null)
const domainToRemove = ref<AdminDomain | null>(null)
const domainPreflight = ref<DomainPreflight | null>(null)
const preflightDomainName = ref('')
const preflightBusy = ref(false)
const preflightError = ref('')
const readiness = ref<DomainReadiness | null>(null)
const readinessDomain = ref('')
const readinessBusy = ref(false)
const readinessError = ref('')

watch(() => props.activeWorkspaces, (workspaces) => {
  if (!workspaces.some(workspace => workspace.id === selectedWorkspaceId.value)) {
    selectedWorkspaceId.value = workspaces[0]?.id ?? ''
  }
}, { immediate: true })

watch(domainInput, () => {
  domainPreflight.value = null
  preflightDomainName.value = ''
  preflightError.value = ''
})

function statusCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { statusCode?: number, status?: number }
  return value.statusCode ?? value.status
}

async function preflightDomain() {
  if (preflightBusy.value || domainBusy.value || !domainInput.value.trim()) return
  preflightBusy.value = true
  preflightDomainName.value = domainInput.value.trim()
  preflightError.value = ''
  domainPreflight.value = null
  try {
    domainPreflight.value = await props.adminFetch<DomainPreflight>('/api/admin/domains/preflight', {
      method: 'POST',
      body: { domain: domainInput.value },
    })
  } catch (error) {
    preflightError.value = $t(statusCode(error) === 400 ? 'admin.domainInvalid' : 'admin.domainPreflightError')
  } finally {
    preflightBusy.value = false
  }
}

async function addDomain() {
  if (domainBusy.value || preflightBusy.value || !selectedWorkspaceId.value || !domainInput.value.trim()) return
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
    domainPreflight.value = null
    preflightDomainName.value = ''
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

async function checkReadiness(domain: AdminDomain) {
  if (readinessBusy.value) return
  readinessBusy.value = true
  readinessDomain.value = domain.domain
  readinessError.value = ''
  readiness.value = null
  try {
    readiness.value = await props.adminFetch<DomainReadiness>(`/api/admin/domains/${encodeURIComponent(domain.id)}/readiness`)
  } catch {
    readinessError.value = $t('admin.mailDnsCheckError')
  } finally {
    readinessBusy.value = false
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
