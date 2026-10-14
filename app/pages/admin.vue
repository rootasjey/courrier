<template>
  <main class="admin-page">
    <div class="admin-content">
      <header class="admin-header">
        <div>
          <p class="admin-kicker">Courrier · Plateforme</p>
          <h1>{{ $t('admin.title') }}</h1>
          <p class="admin-description">{{ $t('admin.description') }}</p>
        </div>
        <button class="admin-refresh" type="button" :disabled="loading" @click="loadOverview">
          <span aria-hidden="true">↻</span>
          {{ $t('admin.refresh') }}
        </button>
      </header>

      <p v-if="loading && !overview" class="admin-state" role="status">{{ $t('admin.loading') }}</p>
      <p v-else-if="failed && !overview" class="admin-state admin-state-error" role="alert">{{ $t('admin.error') }}</p>
      <template v-else-if="overview">
        <section class="admin-metrics" :aria-label="$t('admin.title')">
          <article class="admin-metric"><span>{{ $t('admin.workspaces') }}</span><strong>{{ overview.counts.workspace_count }}</strong></article>
          <article class="admin-metric"><span>{{ $t('admin.domains') }}</span><strong>{{ overview.counts.domain_count }}</strong></article>
          <article class="admin-metric"><span>{{ $t('admin.memberships') }}</span><strong>{{ overview.counts.membership_count }}</strong></article>
          <article class="admin-metric"><span>{{ $t('admin.pendingInvitations') }}</span><strong>{{ overview.counts.pending_invitation_count }}</strong></article>
        </section>

        <section class="admin-section" aria-labelledby="admin-workspaces-heading">
          <h2 id="admin-workspaces-heading">{{ $t('admin.workspaces') }}</h2>
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.domains') }}</th><th>{{ $t('admin.mailboxes') }}</th><th>{{ $t('admin.members') }}</th><th>{{ $t('admin.created') }}</th></tr></thead>
              <tbody>
                <tr v-for="workspace in overview.workspaces" :key="workspace.id">
                  <td><strong>{{ workspace.name }}</strong><small>{{ workspace.id }}</small></td>
                  <td><span class="admin-status" :class="`is-${workspace.status}`">{{ statusLabel(workspace.status) }}</span></td>
                  <td>{{ workspace.domain_count }}</td><td>{{ workspace.mailbox_count }}</td><td>{{ workspace.member_count }}</td><td>{{ formatDate(workspace.created_at) }}</td>
                </tr>
                <tr v-if="!overview.workspaces.length"><td colspan="6" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="admin-section" aria-labelledby="admin-domains-heading">
          <h2 id="admin-domains-heading">{{ $t('admin.domains') }}</h2>
          <p class="admin-section-description">{{ $t('admin.domainVerificationDescription') }}</p>
          <p v-if="domainError" class="admin-access-error" role="alert">{{ domainError }}</p>
          <p v-if="domainNotice" class="admin-access-notice" role="status">{{ domainNotice }}</p>
          <div class="admin-domain-controls">
            <label class="admin-access-field">
              <span>{{ $t('admin.workspace') }}</span>
              <select v-model="selectedDomainWorkspaceId" :disabled="domainBusy || !activeWorkspaces.length">
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
            <button class="admin-access-action" type="button" :disabled="domainBusy || !selectedDomainWorkspaceId || !domainInput.trim()" @click="addDomain">
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
                <tr v-for="domain in overview.domains" :key="domain.id">
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
                <tr v-if="!overview.domains.length"><td colspan="6" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="admin-section" aria-labelledby="admin-members-heading">
          <h2 id="admin-members-heading">{{ $t('admin.memberships') }}</h2>
          <p class="admin-section-description">{{ $t('admin.membershipLifecycleDescription') }}</p>
          <p v-if="membershipError" class="admin-access-error" role="alert">{{ membershipError }}</p>
          <p v-if="membershipNotice" class="admin-access-notice" role="status">{{ membershipNotice }}</p>
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.user') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.role') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.created') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
              <tbody>
                <tr v-for="membership in overview.memberships" :key="membership.id">
                  <td><strong>{{ membership.display_name || membership.email }}</strong><small>{{ membership.email }}</small></td><td>{{ membership.workspace_name }}</td>
                  <td><span class="admin-role">{{ membership.role }}</span></td>
                  <td><span class="admin-status" :class="`is-${membership.membership_status}`">{{ statusLabel(membership.membership_status) }}</span><small v-if="membership.user_status !== 'active'">{{ statusLabel(membership.user_status) }}</small></td>
                  <td>{{ formatDate(membership.created_at) }}</td>
                  <td>
                    <span v-if="membership.membership_status === 'active' && membership.is_last_active_owner" class="admin-access-protected">{{ $t('admin.lastOwnerProtected') }}</span>
                    <button
                      v-else
                      class="admin-membership-action"
                      :class="membership.membership_status === 'active' ? 'is-suspend' : 'is-reactivate'"
                      type="button"
                      :disabled="membershipBusy"
                      @click="membershipToChange = membership"
                    >
                      {{ $t(membership.membership_status === 'active' ? 'admin.suspendMember' : 'admin.reactivateMember') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!overview.memberships.length"><td colspan="6" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="admin-section" aria-labelledby="admin-mailbox-access-heading">
          <h2 id="admin-mailbox-access-heading">{{ $t('admin.mailboxAccess') }}</h2>
          <p class="admin-section-description">{{ $t('admin.mailboxAccessDescription') }}</p>
          <p v-if="mailboxAccess?.truncated.mailboxes || mailboxAccess?.truncated.members || mailboxAccess?.truncated.grants" class="admin-access-notice" role="status">
            {{ $t('admin.mailboxAccessTruncated') }}
          </p>
          <p v-if="accessError" class="admin-access-error" role="alert">{{ accessError }}</p>
          <p v-if="accessNotice" class="admin-access-notice" role="status">{{ accessNotice }}</p>

          <template v-if="mailboxAccess?.mailboxes.length">
            <div class="admin-access-controls">
              <label class="admin-access-field">
                <span>{{ $t('admin.mailbox') }}</span>
                <select v-model="selectedMailboxId" :disabled="accessBusy || Boolean(accessToRevoke)">
                  <option v-for="mailbox in mailboxAccess.mailboxes" :key="mailbox.id" :value="mailbox.id">
                    {{ mailbox.address }} — {{ mailbox.workspace_name }}
                  </option>
                </select>
              </label>
              <label class="admin-access-field">
                <span>{{ $t('admin.memberToGrant') }}</span>
                <select v-model="selectedUserId" :disabled="accessBusy || !availableMembers.length">
                  <option value="">{{ $t(mailboxAccess.truncated.members ? 'admin.memberListLimited' : availableMembers.length ? 'admin.chooseMember' : 'admin.allMembersGranted') }}</option>
                  <option v-for="member in availableMembers" :key="member.user_id" :value="member.user_id">
                    {{ member.display_name || member.email }} · {{ member.role }}
                  </option>
                </select>
              </label>
              <button class="admin-access-action" type="button" :disabled="!selectedUserId || accessBusy" @click="grantSelectedAccess">
                {{ accessBusy ? $t('admin.savingAccess') : $t('admin.grantAccess') }}
              </button>
            </div>

            <div v-if="selectedMailbox" class="admin-table-wrap admin-access-table">
              <table>
                <thead><tr><th>{{ $t('admin.user') }}</th><th>{{ $t('admin.role') }}</th><th>{{ $t('admin.accessStatus') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
                <tbody>
                  <tr v-for="grant in selectedMailboxGrants" :key="`${grant.mailbox_id}:${grant.user_id}`">
                    <td><strong>{{ grant.display_name || grant.email }}</strong><small>{{ grant.email }}</small></td>
                    <td><span class="admin-role">{{ grant.role }}</span></td>
                    <td><span class="admin-status is-active">{{ $t('admin.accessGranted') }}</span></td>
                    <td>
                      <span v-if="grant.role === 'owner'" class="admin-access-protected">{{ $t('admin.ownerAccessProtected') }}</span>
                      <button v-else class="admin-access-remove" type="button" :disabled="accessBusy" @click="accessToRevoke = grant">
                        {{ $t('admin.revokeAccess') }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!selectedMailboxGrants.length"><td colspan="4" class="admin-empty">{{ $t('admin.noMailboxGrants') }}</td></tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="admin-empty admin-access-empty">{{ $t('admin.noActiveMailboxes') }}</p>
        </section>

        <section class="admin-section" aria-labelledby="admin-invitations-heading">
          <h2 id="admin-invitations-heading">{{ $t('admin.invitations') }}</h2>
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.email') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.role') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.expires') }}</th></tr></thead>
              <tbody>
                <tr v-for="invitation in overview.invitations" :key="invitation.id">
                  <td>{{ invitation.email }}</td><td>{{ invitation.workspace_name }}</td><td>{{ invitation.role }}</td>
                  <td><span class="admin-status" :class="`is-${invitation.status}`">{{ statusLabel(invitation.status) }}</span></td><td>{{ formatDate(invitation.expires_at) }}</td>
                </tr>
                <tr v-if="!overview.invitations.length"><td colspan="5" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="admin-section" aria-labelledby="admin-audit-heading">
          <h2 id="admin-audit-heading">{{ $t('admin.audit') }}</h2>
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.action') }}</th><th>{{ $t('admin.target') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.date') }}</th></tr></thead>
              <tbody>
                <tr v-for="entry in overview.audit" :key="entry.id">
                  <td><strong>{{ entry.action }}</strong><small v-if="entry.actor_email || entry.actor_user_id">{{ entry.actor_email || entry.actor_user_id }}</small></td>
                  <td>{{ entry.target_type }}<small v-if="entry.target_id">{{ entry.target_id }}</small></td>
                  <td>{{ entry.workspace_id || '—' }}</td><td>{{ formatDate(entry.created_at) }}</td>
                </tr>
                <tr v-if="!overview.audit.length"><td colspan="4" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <NDialog
      :open="Boolean(membershipToChange)"
      :title="$t(membershipToChange?.membership_status === 'active' ? 'admin.suspendMember' : 'admin.reactivateMember')"
      :description="membershipDialogDescription"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !membershipBusy) membershipToChange = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t(membershipToChange?.membership_status === 'active' ? 'admin.suspendMember' : 'admin.reactivateMember') }}</NDialogTitle>
          <NDialogDescription>{{ membershipDialogDescription }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="membershipBusy" @click="membershipToChange = null">{{ $t('common.cancel') }}</button>
          <button
            :class="membershipToChange?.membership_status === 'active' ? 'dialog-danger' : 'dialog-save'"
            type="button"
            :disabled="membershipBusy"
            @click="updateMembershipStatus"
          >
            {{ membershipBusy ? $t('admin.savingMembership') : $t(membershipToChange?.membership_status === 'active' ? 'admin.suspendMember' : 'admin.reactivateMember') }}
          </button>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="Boolean(accessToRevoke)"
      :title="$t('admin.revokeAccess')"
      :description="$t('admin.revokeAccessDescription', { member: accessToRevoke?.email || '', mailbox: accessToRevoke?.mailbox_address || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !accessBusy) accessToRevoke = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.revokeAccess') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.revokeAccessDescription', { member: accessToRevoke?.email || '', mailbox: accessToRevoke?.mailbox_address || '' }) }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="accessBusy" @click="accessToRevoke = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="accessBusy" @click="revokeSelectedAccess">
            {{ accessBusy ? $t('admin.savingAccess') : $t('admin.revokeAccess') }}
          </button>
        </div>
      </template>
    </NDialog>

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
  </main>
</template>

<script setup lang="ts">
definePageMeta({ pageTransition: false })

type AdminMembership = { id: string, workspace_id: string, workspace_name: string, user_id: string, email: string, display_name: string, user_status: string, role: string, membership_status: string, created_at: string, is_last_active_owner: number }
type AdminOverview = {
  counts: { workspace_count: number, domain_count: number, membership_count: number, pending_invitation_count: number }
  workspaces: { id: string, name: string, status: string, created_at: string, domain_count: number, mailbox_count: number, member_count: number }[]
  domains: { id: string, workspace_id: string, workspace_name: string, domain: string, verification_status: string, verified_at: string | null, mailbox_count: number }[]
  memberships: AdminMembership[]
  invitations: { id: string, workspace_id: string, workspace_name: string, email: string, role: string, expires_at: string, accepted_at: string | null, revoked_at: string | null, created_at: string, status: string }[]
  audit: { id: string, actor_user_id: string | null, actor_email: string | null, action: string, target_type: string, target_id: string | null, workspace_id: string | null, created_at: string }[]
}
type DomainChallenge = { domainId: string, domain: string, recordName: string, recordValue: string, expiresAt: string }
type MailboxAccess = {
  mailboxes: { id: string, workspace_id: string, workspace_name: string, address: string }[]
  members: { workspace_id: string, user_id: string, email: string, display_name: string | null, role: string }[]
  grants: { workspace_id: string, mailbox_id: string, user_id: string }[]
  truncated: { mailboxes: boolean, members: boolean, grants: boolean }
}
type AccessGrant = { mailbox_id: string, user_id: string, email: string, display_name: string | null, role: string, mailbox_address: string }

const { $t } = useI18n()
const overview = ref<AdminOverview | null>(null)
const mailboxAccess = ref<MailboxAccess | null>(null)
const loading = ref(false)
const failed = ref(false)
const selectedMailboxId = ref('')
const selectedUserId = ref('')
const accessBusy = ref(false)
const accessError = ref('')
const accessNotice = ref('')
const accessToRevoke = ref<AccessGrant | null>(null)
const membershipBusy = ref(false)
const membershipError = ref('')
const membershipNotice = ref('')
const membershipToChange = ref<AdminMembership | null>(null)
const selectedDomainWorkspaceId = ref('')
const domainInput = ref('')
const domainBusy = ref(false)
const domainError = ref('')
const domainNotice = ref('')
const domainChallenge = ref<DomainChallenge | null>(null)
const domainToRemove = ref<AdminOverview['domains'][number] | null>(null)

const activeWorkspaces = computed(() => overview.value?.workspaces.filter(workspace => workspace.status === 'active') ?? [])
const selectedMailbox = computed(() => mailboxAccess.value?.mailboxes.find(mailbox => mailbox.id === selectedMailboxId.value) ?? null)
const selectedMailboxGrants = computed<AccessGrant[]>(() => {
  if (!selectedMailbox.value || !mailboxAccess.value) return []
  return mailboxAccess.value.grants
    .filter(grant => grant.mailbox_id === selectedMailbox.value!.id && grant.workspace_id === selectedMailbox.value!.workspace_id)
    .map((grant) => {
      const member = mailboxAccess.value!.members.find(candidate => candidate.workspace_id === grant.workspace_id && candidate.user_id === grant.user_id)
      return { mailbox_id: grant.mailbox_id, user_id: grant.user_id, email: member?.email ?? '', display_name: member?.display_name ?? null, role: member?.role ?? '', mailbox_address: selectedMailbox.value!.address }
    })
    .filter(grant => grant.email)
})
const availableMembers = computed(() => {
  if (!selectedMailbox.value || !mailboxAccess.value) return []
  const activeGrants = new Set(selectedMailboxGrants.value.map(grant => grant.user_id))
  return mailboxAccess.value.members.filter(member => member.workspace_id === selectedMailbox.value!.workspace_id && !activeGrants.has(member.user_id))
})

const membershipDialogDescription = computed(() => {
  const membership = membershipToChange.value
  if (!membership) return ''
  return $t(
    membership.membership_status === 'active' ? 'admin.suspendMemberDescription' : 'admin.reactivateMemberDescription',
    { member: membership.email, workspace: membership.workspace_name },
  )
})

watch(selectedMailboxId, () => {
  selectedUserId.value = ''
  accessError.value = ''
  accessNotice.value = ''
})

useSeoMeta({ title: () => `${$t('admin.title')} — Courrier` })

function statusLabel(status: string) {
  const known = ['active', 'suspended', 'verified', 'legacy_unverified', 'unverified', 'pending', 'accepted', 'expired', 'revoked']
  return known.includes(status) ? $t(`admin.${status}`) : status
}

function formatDate(value: string) {
  const date = new Date(value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

async function loadOverview() {
  if (loading.value) return
  loading.value = true
  failed.value = false
  try {
    const [nextOverview, nextMailboxAccess] = await Promise.all([
      $fetch<AdminOverview>('/api/admin/overview'),
      $fetch<MailboxAccess>('/api/admin/mailbox-access'),
    ])
    overview.value = nextOverview
    mailboxAccess.value = nextMailboxAccess
    if (!activeWorkspaces.value.some(workspace => workspace.id === selectedDomainWorkspaceId.value)) {
      selectedDomainWorkspaceId.value = activeWorkspaces.value[0]?.id ?? ''
    }
    if (!nextMailboxAccess.mailboxes.some(mailbox => mailbox.id === selectedMailboxId.value)) {
      selectedMailboxId.value = nextMailboxAccess.mailboxes[0]?.id ?? ''
    }
    if (!availableMembers.value.some(member => member.user_id === selectedUserId.value)) selectedUserId.value = ''
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function addDomain() {
  if (!selectedDomainWorkspaceId.value || !domainInput.value.trim() || domainBusy.value) return
  domainBusy.value = true
  domainError.value = ''
  domainNotice.value = ''
  try {
    await $fetch('/api/admin/domains', {
      method: 'POST',
      body: { workspaceId: selectedDomainWorkspaceId.value, domain: domainInput.value },
    })
    domainNotice.value = $t('admin.domainAddedNotice')
    domainInput.value = ''
    await loadOverview()
  } catch (error) {
    const statusCode = (error as { statusCode?: number, status?: number })?.statusCode ?? (error as { status?: number })?.status
    domainError.value = $t(statusCode === 409 ? 'admin.domainAlreadyAdded' : statusCode === 400 ? 'admin.domainInvalid' : 'admin.domainSaveError')
  } finally {
    domainBusy.value = false
  }
}

async function prepareDomainChallenge(domain: AdminOverview['domains'][number]) {
  if (domainBusy.value) return
  domainBusy.value = true
  domainError.value = ''
  domainNotice.value = ''
  try {
    domainChallenge.value = await $fetch<DomainChallenge>(`/api/admin/domains/${encodeURIComponent(domain.id)}/challenge`, { method: 'POST' })
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
    const result = await $fetch<{ verified: boolean }>(`/api/admin/domains/${encodeURIComponent(challenge.domainId)}/verify`, { method: 'POST' })
    if (!result.verified) {
      domainNotice.value = $t('admin.domainDnsNotVisible')
      return
    }
    domainChallenge.value = null
    domainNotice.value = $t('admin.domainVerifiedNotice')
    await loadOverview()
  } catch (error) {
    const statusCode = (error as { statusCode?: number, status?: number })?.statusCode ?? (error as { status?: number })?.status
    domainError.value = $t(statusCode === 410 ? 'admin.domainChallengeExpired' : 'admin.domainVerifyError')
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
    await $fetch(`/api/admin/domains/${encodeURIComponent(domain.id)}`, { method: 'DELETE' })
    if (domainChallenge.value?.domainId === domain.id) domainChallenge.value = null
    domainToRemove.value = null
    domainNotice.value = $t('admin.domainRemovedNotice')
    await loadOverview()
  } catch {
    domainError.value = $t('admin.domainRemoveError')
  } finally {
    domainBusy.value = false
  }
}

async function grantSelectedAccess() {
  if (!selectedMailbox.value || !selectedUserId.value || accessBusy.value) return
  accessBusy.value = true
  accessError.value = ''
  accessNotice.value = ''
  try {
    await $fetch('/api/admin/mailbox-access', {
      method: 'POST',
      body: { mailboxId: selectedMailbox.value.id, userId: selectedUserId.value },
    })
    accessNotice.value = $t('admin.accessGrantedNotice')
    selectedUserId.value = ''
    await loadOverview()
  } catch {
    accessError.value = $t('admin.accessSaveError')
  } finally {
    accessBusy.value = false
  }
}

async function revokeSelectedAccess() {
  const grant = accessToRevoke.value
  if (!grant || accessBusy.value) return
  accessBusy.value = true
  accessError.value = ''
  accessNotice.value = ''
  try {
    await $fetch('/api/admin/mailbox-access', {
      method: 'DELETE',
      body: { mailboxId: grant.mailbox_id, userId: grant.user_id },
    })
    accessToRevoke.value = null
    accessNotice.value = $t('admin.accessRevokedNotice')
    await loadOverview()
  } catch {
    accessError.value = $t('admin.accessSaveError')
  } finally {
    accessBusy.value = false
  }
}

async function updateMembershipStatus() {
  const membership = membershipToChange.value
  if (!membership || membershipBusy.value) return

  const nextStatus = membership.membership_status === 'active' ? 'suspended' : 'active'
  membershipBusy.value = true
  membershipError.value = ''
  membershipNotice.value = ''
  try {
    await $fetch(`/api/admin/memberships/${encodeURIComponent(membership.id)}`, {
      method: 'PATCH',
      body: { status: nextStatus },
    })
    membershipToChange.value = null
    membershipNotice.value = $t(nextStatus === 'suspended' ? 'admin.membershipSuspendedNotice' : 'admin.membershipReactivatedNotice')
    await loadOverview()
  } catch {
    membershipError.value = $t('admin.membershipSaveError')
  } finally {
    membershipBusy.value = false
  }
}

onMounted(loadOverview)
</script>
