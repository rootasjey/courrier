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
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.domain') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.verification') }}</th><th>{{ $t('admin.mailboxes') }}</th><th>{{ $t('admin.verifiedAt') }}</th></tr></thead>
              <tbody>
                <tr v-for="domain in overview.domains" :key="domain.id">
                  <td><strong>{{ domain.domain }}</strong></td><td>{{ domain.workspace_name }}</td>
                  <td><span class="admin-status" :class="`is-${domain.verification_status}`">{{ statusLabel(domain.verification_status) }}</span></td>
                  <td>{{ domain.mailbox_count }}</td><td>{{ domain.verified_at ? formatDate(domain.verified_at) : '—' }}</td>
                </tr>
                <tr v-if="!overview.domains.length"><td colspan="5" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="admin-section" aria-labelledby="admin-members-heading">
          <h2 id="admin-members-heading">{{ $t('admin.memberships') }}</h2>
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.user') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.role') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.created') }}</th></tr></thead>
              <tbody>
                <tr v-for="membership in overview.memberships" :key="membership.id">
                  <td><strong>{{ membership.display_name || membership.email }}</strong><small>{{ membership.email }}</small></td><td>{{ membership.workspace_name }}</td>
                  <td><span class="admin-role">{{ membership.role }}</span></td>
                  <td><span class="admin-status" :class="`is-${membership.membership_status}`">{{ statusLabel(membership.membership_status) }}</span><small v-if="membership.user_status !== 'active'">{{ statusLabel(membership.user_status) }}</small></td>
                  <td>{{ formatDate(membership.created_at) }}</td>
                </tr>
                <tr v-if="!overview.memberships.length"><td colspan="5" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
              </tbody>
            </table>
          </div>
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
  </main>
</template>

<script setup lang="ts">
definePageMeta({ pageTransition: false })

type AdminOverview = {
  counts: { workspace_count: number, domain_count: number, membership_count: number, pending_invitation_count: number }
  workspaces: { id: string, name: string, status: string, created_at: string, domain_count: number, mailbox_count: number, member_count: number }[]
  domains: { id: string, workspace_id: string, workspace_name: string, domain: string, verification_status: string, verified_at: string | null, mailbox_count: number }[]
  memberships: { id: string, workspace_id: string, workspace_name: string, user_id: string, email: string, display_name: string, user_status: string, role: string, membership_status: string, created_at: string }[]
  invitations: { id: string, workspace_id: string, workspace_name: string, email: string, role: string, expires_at: string, accepted_at: string | null, revoked_at: string | null, created_at: string, status: string }[]
  audit: { id: string, actor_user_id: string | null, actor_email: string | null, action: string, target_type: string, target_id: string | null, workspace_id: string | null, created_at: string }[]
}

const { $t } = useI18n()
const overview = ref<AdminOverview | null>(null)
const loading = ref(false)
const failed = ref(false)

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
    overview.value = await $fetch<AdminOverview>('/api/admin/overview')
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadOverview)
</script>
