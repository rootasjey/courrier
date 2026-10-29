<template>
  <main class="workspace-page">
    <div class="workspace-content">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Courrier · {{ $t('workspace.kicker') }}</p>
          <h1>{{ state?.workspace.name || $t('workspace.title') }}</h1>
          <p class="workspace-description">{{ $t('workspace.description') }}</p>
        </div>
        <NuxtLink class="workspace-back" to="/mail/inbox">{{ $t('workspace.backToInbox') }}</NuxtLink>
      </header>

      <p v-if="loading" class="workspace-state" role="status">{{ $t('workspace.loading') }}</p>
      <p v-else-if="loadError" class="workspace-state workspace-error" role="alert">{{ $t('workspace.loadError') }}</p>
      <template v-else-if="state">
        <section class="workspace-section" aria-labelledby="workspace-members-title">
          <h2 id="workspace-members-title">{{ $t('workspace.members') }}</h2>
          <p v-if="state.truncated.members" class="workspace-notice" role="status">{{ $t('workspace.membersTruncated') }}</p>
          <div class="workspace-table-wrap workspace-desktop-list">
            <table>
              <thead><tr><th>{{ $t('workspace.user') }}</th><th>{{ $t('workspace.role') }}</th><th>{{ $t('workspace.status') }}</th><th>{{ $t('workspace.joined') }}</th><th>{{ $t('workspace.action') }}</th></tr></thead>
              <tbody>
                <tr v-for="member in state.members" :key="member.id">
                  <td><strong>{{ member.display_name || member.email }}</strong><small>{{ member.email }}</small></td>
                  <td><span class="workspace-role">{{ $t(`workspace.roles.${member.role}`) }}</span></td>
                  <td><span class="workspace-status" :class="`is-${member.status}`">{{ $t(`workspace.statuses.${member.status}`) }}</span></td>
                  <td>{{ formatDate(member.created_at) }}</td>
                  <td>
                    <div v-if="canManageMember(member)" class="workspace-member-actions">
                      <select :aria-label="$t('workspace.changeRoleFor', { email: member.email })" :value="member.role" :disabled="busy" @change="changeMemberRole(member, ($event.target as HTMLSelectElement).value)">
                        <option value="member">{{ $t('workspace.roles.member') }}</option>
                        <option value="viewer">{{ $t('workspace.roles.viewer') }}</option>
                        <option v-if="state.workspace.role === 'owner'" value="admin">{{ $t('workspace.roles.admin') }}</option>
                      </select>
                      <button class="workspace-revoke" type="button" :disabled="busy" @click="memberToChange = member; memberAction = member.status === 'active' ? 'suspend' : 'reactivate'">
                        {{ member.status === 'active' ? $t('workspace.suspend') : $t('workspace.reactivate') }}
                      </button>
                    </div>
                    <span v-else class="workspace-member-protected">{{ $t('workspace.ownerProtected') }}</span>
                  </td>
                </tr>
                <tr v-if="!state.members.length"><td colspan="5" class="workspace-empty">{{ $t('workspace.noMembers') }}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="workspace-mobile-list">
            <article v-for="member in state.members" :key="member.id" class="workspace-member-card">
              <div class="workspace-card-heading">
                <strong>{{ member.display_name || member.email }}</strong>
                <span class="workspace-status" :class="`is-${member.status}`">{{ $t(`workspace.statuses.${member.status}`) }}</span>
              </div>
              <p class="workspace-card-email">{{ member.email }}</p>
              <div class="workspace-card-meta">
                <span class="workspace-role">{{ $t(`workspace.roles.${member.role}`) }}</span>
                <span>{{ $t('workspace.joined') }} · {{ formatDate(member.created_at) }}</span>
              </div>
              <div v-if="canManageMember(member)" class="workspace-mobile-actions">
                <select :aria-label="$t('workspace.changeRoleFor', { email: member.email })" :value="member.role" :disabled="busy" @change="changeMemberRole(member, ($event.target as HTMLSelectElement).value)">
                  <option value="member">{{ $t('workspace.roles.member') }}</option>
                  <option value="viewer">{{ $t('workspace.roles.viewer') }}</option>
                  <option v-if="state.workspace.role === 'owner'" value="admin">{{ $t('workspace.roles.admin') }}</option>
                </select>
                <button class="workspace-revoke" type="button" :disabled="busy" @click="memberToChange = member; memberAction = member.status === 'active' ? 'suspend' : 'reactivate'">
                  {{ member.status === 'active' ? $t('workspace.suspend') : $t('workspace.reactivate') }}
                </button>
              </div>
              <span v-else class="workspace-member-protected">{{ $t('workspace.ownerProtected') }}</span>
            </article>
            <p v-if="!state.members.length" class="workspace-empty-card">{{ $t('workspace.noMembers') }}</p>
          </div>
        </section>

        <WorkspaceMailboxAccessSection v-if="state.workspace.role === 'owner' || state.workspace.role === 'admin'" :is-owner="state.workspace.role === 'owner'" />

        <section class="workspace-section" aria-labelledby="workspace-invitations-title">
          <h2 id="workspace-invitations-title">{{ $t('workspace.invitations') }}</h2>
          <p class="workspace-section-description">{{ $t('workspace.invitationDescription') }}</p>
          <p v-if="notice" class="workspace-notice" role="status">{{ notice }}</p>
          <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
          <p v-if="state.truncated.invitations" class="workspace-notice" role="status">{{ $t('workspace.invitationsTruncated') }}</p>

          <form class="workspace-invitation-form" @submit.prevent="sendInvitation">
            <label>
              <span>{{ $t('workspace.email') }}</span>
              <input v-model="email" type="email" maxlength="254" autocomplete="email" autocapitalize="none" spellcheck="false" :placeholder="$t('workspace.emailPlaceholder')" :disabled="busy" required>
            </label>
            <label>
              <span>{{ $t('workspace.role') }}</span>
              <select v-model="role" :disabled="busy">
                <option value="member">{{ $t('workspace.roles.member') }}</option>
                <option value="viewer">{{ $t('workspace.roles.viewer') }}</option>
                <option v-if="state.workspace.role === 'owner'" value="admin">{{ $t('workspace.roles.admin') }}</option>
              </select>
            </label>
            <button class="workspace-primary" type="submit" :disabled="busy || !email.trim()">
              {{ busy ? $t('workspace.sending') : $t('workspace.sendInvitation') }}
            </button>
          </form>
          <p class="workspace-mailbox-note">{{ $t('workspace.mailboxAccessNote') }}</p>

          <div class="workspace-table-wrap workspace-desktop-list">
            <table>
              <thead><tr><th>{{ $t('workspace.email') }}</th><th>{{ $t('workspace.role') }}</th><th>{{ $t('workspace.expires') }}</th><th>{{ $t('workspace.action') }}</th></tr></thead>
              <tbody>
                <tr v-for="invitation in state.invitations" :key="invitation.id">
                  <td>{{ invitation.email }}</td>
                  <td>{{ $t(`workspace.roles.${invitation.role}`) }}</td>
                  <td>{{ formatDate(invitation.expires_at) }}</td>
                  <td><button class="workspace-revoke" type="button" :disabled="busy" @click="invitationToRevoke = invitation">{{ $t('workspace.revoke') }}</button></td>
                </tr>
                <tr v-if="!state.invitations.length"><td colspan="4" class="workspace-empty">{{ $t('workspace.noInvitations') }}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="workspace-mobile-list">
            <article v-for="invitation in state.invitations" :key="invitation.id" class="workspace-invitation-card">
              <strong>{{ invitation.email }}</strong>
              <div class="workspace-card-meta">
                <span class="workspace-role">{{ $t(`workspace.roles.${invitation.role}`) }}</span>
                <span>{{ $t('workspace.expires') }} · {{ formatDate(invitation.expires_at) }}</span>
              </div>
              <button class="workspace-revoke" type="button" :disabled="busy" @click="invitationToRevoke = invitation">{{ $t('workspace.revoke') }}</button>
            </article>
            <p v-if="!state.invitations.length" class="workspace-empty-card">{{ $t('workspace.noInvitations') }}</p>
          </div>
          <NuxtLink v-if="showMfaLink" class="workspace-mfa-link" :to="{ path: '/mfa', query: { redirect: '/workspace' } }">{{ $t('workspace.verifyMfa') }}</NuxtLink>
        </section>
      </template>
    </div>

    <NDialog :open="Boolean(invitationToRevoke || memberToChange)" @update:open="(open: boolean) => { if (!open && !busy) closeConfirmation() }">
      <NDialogContent class="workspace-confirm-dialog">
        <NDialogHeader>
          <NDialogTitle>{{ memberToChange ? $t(memberAction === 'suspend' ? 'workspace.suspend' : 'workspace.reactivate') : $t('workspace.revoke') }}</NDialogTitle>
          <NDialogDescription>{{ memberToChange
            ? $t(memberAction === 'suspend' ? 'workspace.suspendDescription' : 'workspace.reactivateDescription', { email: memberToChange.email })
            : $t('workspace.revokeDescription', { email: invitationToRevoke?.email || '' }) }}</NDialogDescription>
        </NDialogHeader>
        <div class="workspace-dialog-actions">
          <button class="workspace-secondary" type="button" :disabled="busy" @click="closeConfirmation">{{ $t('common.cancel') }}</button>
          <button :class="memberToChange && memberAction === 'reactivate' ? 'workspace-primary' : 'workspace-danger'" type="button" :disabled="busy" @click="memberToChange ? updateMemberStatus() : revokeInvitation()">
            {{ busy ? $t('workspace.sending') : memberToChange ? $t(memberAction === 'suspend' ? 'workspace.suspend' : 'workspace.reactivate') : $t('workspace.revoke') }}
          </button>
        </div>
      </NDialogContent>
    </NDialog>
  </main>
</template>

<script setup lang="ts">
type Role = 'owner' | 'admin' | 'member' | 'viewer'
type InvitationRole = Exclude<Role, 'owner'>
type WorkspaceManagement = {
  workspace: { id: string, name: string, role: 'owner' | 'admin' }
  members: { id: string, user_id: string, email: string, display_name: string, role: Role, status: 'active' | 'suspended', created_at: string }[]
  invitations: { id: string, email: string, role: InvitationRole, expires_at: string, created_at: string }[]
  truncated: { members: boolean, invitations: boolean }
}

const { $t } = useI18n()
const state = ref<WorkspaceManagement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const email = ref('')
const role = ref<InvitationRole>('member')
const invitationToRevoke = ref<WorkspaceManagement['invitations'][number] | null>(null)
const memberToChange = ref<WorkspaceManagement['members'][number] | null>(null)
const memberAction = ref<'suspend' | 'reactivate'>('suspend')
const showMfaLink = ref(false)

function canManageMember(member: WorkspaceManagement['members'][number]) {
  return member.role !== 'owner' && (state.value?.workspace.role === 'owner' || member.role !== 'admin')
}

function closeConfirmation() {
  invitationToRevoke.value = null
  memberToChange.value = null
}

function formatDate(value: string) {
  const date = new Date(value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function statusCode(cause: unknown) {
  if (!cause || typeof cause !== 'object') return 0
  const value = cause as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  return Number(value.statusCode || value.status || value.response?.status || 0)
}

function errorCode(cause: unknown) {
  if (!cause || typeof cause !== 'object') return ''
  const error = cause as { data?: unknown }
  const payload = error.data
  if (!payload || typeof payload !== 'object') return ''
  const body = payload as { code?: unknown, data?: { code?: unknown } }
  const code = body.code ?? body.data?.code
  return typeof code === 'string' ? code : ''
}

async function loadManagement() {
  try {
    state.value = await $fetch<WorkspaceManagement>('/api/workspace/management')
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadManagement)

async function sendInvitation() {
  if (busy.value || !email.value.trim() || !state.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  showMfaLink.value = false
  try {
    await $fetch('/api/workspace/invitations', { method: 'POST', body: { email: email.value, role: role.value } })
    notice.value = $t('workspace.invitationSent', { email: email.value.trim() })
    email.value = ''
    await loadManagement()
  } catch (cause) {
    const status = statusCode(cause)
    const code = errorCode(cause)
    error.value = status === 400 ? $t('workspace.invalidInvitation')
      : status === 403 && code === 'owner_required' ? $t('workspace.adminInviteOwnerOnly')
        : status === 403 && code === 'mfa_required' ? $t('workspace.mfaRequired')
        : status === 404 ? $t('workspace.workspaceUnavailable')
          : status === 409 ? $t('workspace.invitationConflict')
            : status === 429 ? $t('workspace.invitationRateLimit')
              : status === 502 || status === 503 ? $t('workspace.invitationSendError')
                : $t('workspace.invitationError')
    showMfaLink.value = status === 403 && code === 'mfa_required'
  } finally {
    busy.value = false
  }
}

async function revokeInvitation() {
  const invitation = invitationToRevoke.value
  if (!invitation || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await $fetch(`/api/workspace/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' })
    invitationToRevoke.value = null
    notice.value = $t('workspace.invitationRevoked')
    await loadManagement()
  } catch (cause) {
    const status = statusCode(cause)
    const code = errorCode(cause)
    error.value = status === 403 && code === 'owner_required' ? $t('workspace.adminInvitationOwnerOnly')
      : status === 403 && code === 'mfa_required' ? $t('workspace.mfaRequired')
      : status === 404 ? $t('workspace.workspaceUnavailable')
        : status === 409 ? $t('workspace.invitationChanged')
          : $t('workspace.invitationError')
    showMfaLink.value = status === 403 && code === 'mfa_required'
  } finally {
    busy.value = false
  }
}

async function changeMemberRole(member: WorkspaceManagement['members'][number], role: string) {
  if (busy.value || role === member.role || !canManageMember(member)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  showMfaLink.value = false
  try {
    await $fetch(`/api/workspace/memberships/${encodeURIComponent(member.id)}`, { method: 'PATCH', body: { role } })
    notice.value = $t('workspace.memberRoleChanged', { email: member.email })
    await loadManagement()
  } catch (cause) {
    const status = statusCode(cause)
    error.value = status === 403 ? $t('workspace.mfaRequired')
      : status === 404 ? $t('workspace.workspaceUnavailable')
        : status === 409 ? $t('workspace.memberChanged')
          : $t('workspace.memberError')
    showMfaLink.value = status === 403
    await loadManagement()
  } finally {
    busy.value = false
  }
}

async function updateMemberStatus() {
  const member = memberToChange.value
  if (!member || busy.value || !canManageMember(member)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  showMfaLink.value = false
  const status = memberAction.value === 'suspend' ? 'suspended' : 'active'
  try {
    await $fetch(`/api/workspace/memberships/${encodeURIComponent(member.id)}`, { method: 'PATCH', body: { status } })
    closeConfirmation()
    notice.value = $t(status === 'suspended' ? 'workspace.memberSuspended' : 'workspace.memberReactivated', { email: member.email })
    await loadManagement()
  } catch (cause) {
    const code = statusCode(cause)
    error.value = code === 403 ? $t('workspace.mfaRequired')
      : code === 404 ? $t('workspace.workspaceUnavailable')
        : code === 409 ? $t('workspace.memberChanged')
          : $t('workspace.memberError')
    showMfaLink.value = code === 403
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.workspace-page { min-height: calc(100vh - 76px); padding: 40px clamp(20px, 5vw, 76px) 80px; }
.workspace-content { width: min(100%, 1120px); margin: 0 auto; }
.workspace-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.workspace-kicker { margin: 0 0 8px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.workspace-header h1 { margin: 0; font-size: clamp(30px, 4vw, 42px); font-weight: 730; letter-spacing: -1.4px; line-height: 1.08; }
.workspace-description { margin: 10px 0 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
.workspace-back, .workspace-secondary, .workspace-revoke { color: var(--ink); text-decoration: none; }
.workspace-back { padding: 10px 13px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); font-size: 12px; font-weight: 620; white-space: nowrap; }
.workspace-section { margin-top: 16px; padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
.workspace-section h2 { margin: 0 0 15px; font-size: 17px; font-weight: 680; letter-spacing: -.3px; }
.workspace-section-description { max-width: 72ch; margin: -7px 0 16px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.workspace-invitation-form { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(160px, .7fr) auto; align-items: end; gap: 12px; margin-bottom: 10px; }
.workspace-invitation-form label { display: grid; gap: 6px; color: var(--ink); font-size: 11px; font-weight: 620; }
.workspace-invitation-form input, .workspace-invitation-form select { width: 100%; min-height: 40px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 12px; }
.workspace-invitation-form input:focus-visible, .workspace-invitation-form select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.workspace-primary, .workspace-danger, .workspace-secondary { min-height: 40px; padding: 0 13px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.workspace-primary { border-color: var(--accent); background: var(--accent); color: var(--paper); }
.workspace-danger { border-color: var(--error); background: var(--error); color: #fff; }
.workspace-primary:disabled, .workspace-danger:disabled, .workspace-secondary:disabled, .workspace-revoke:disabled { cursor: wait; opacity: .6; }
.workspace-mailbox-note { margin: 0 0 18px; color: var(--muted); font-size: 11px; line-height: 1.5; }
.workspace-table-wrap { overflow-x: auto; }
.workspace-table-wrap table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
.workspace-table-wrap th { padding: 0 12px 10px; color: var(--quiet); font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.workspace-table-wrap td { padding: 12px; border-top: 1px solid var(--line); color: var(--muted); vertical-align: middle; }
.workspace-table-wrap td:first-child, .workspace-table-wrap th:first-child { padding-left: 0; }
.workspace-table-wrap td:last-child, .workspace-table-wrap th:last-child { padding-right: 0; }
.workspace-table-wrap td strong { color: var(--ink); font-size: 12px; font-weight: 650; }
.workspace-table-wrap td small { display: block; margin-top: 3px; color: var(--quiet); font-size: 10px; }
.workspace-role, .workspace-status { display: inline-flex; min-height: 23px; align-items: center; padding: 2px 8px; border-radius: 999px; background: var(--accent-wash); color: var(--accent); font-size: 10px; font-weight: 650; white-space: nowrap; }
.workspace-status.is-active { background: color-mix(in srgb, #31a879 13%, var(--paper)); color: #27815f; }
.workspace-status.is-suspended { background: color-mix(in srgb, var(--error) 10%, var(--paper)); color: var(--error); }
.workspace-empty { padding: 26px 12px !important; color: var(--quiet) !important; text-align: center; }
.workspace-state { padding: 36px 18px; border: 1px solid var(--line); border-radius: 13px; color: var(--muted); text-align: center; }
.workspace-notice { margin: 0 0 12px; color: var(--accent); font-size: 12px; line-height: 1.5; }
.workspace-error { margin: 0 0 12px; color: var(--error); font-size: 12px; line-height: 1.5; }
.workspace-mfa-link { display: inline-block; margin-top: 10px; color: var(--accent); font-size: 12px; font-weight: 650; }
.workspace-revoke { padding: 6px 8px; border: 1px solid var(--line); border-radius: 7px; background: transparent; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.workspace-member-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.workspace-member-actions select { min-height: 30px; padding: 0 7px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); color: var(--ink); font: inherit; font-size: 11px; }
.workspace-member-protected { color: var(--quiet); font-size: 10px; }
.workspace-mobile-list { display: none; }
.workspace-member-card, .workspace-invitation-card { display: grid; gap: 9px; padding: 13px; border: 1px solid var(--line); border-radius: 10px; }
.workspace-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.workspace-card-heading strong, .workspace-invitation-card > strong { min-width: 0; overflow-wrap: anywhere; color: var(--ink); font-size: 12px; font-weight: 650; }
.workspace-card-email { margin: -5px 0 0; color: var(--quiet); font-size: 10px; overflow-wrap: anywhere; }
.workspace-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 10px; }
.workspace-mobile-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.workspace-mobile-actions select { min-width: 0; min-height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); color: var(--ink); font: inherit; font-size: 11px; }
.workspace-empty-card { margin: 0; padding: 16px; color: var(--quiet); font-size: 11px; text-align: center; }
.workspace-confirm-dialog { width: min(100% - 32px, 430px); padding: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow); }
.workspace-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.workspace-confirm-dialog :deep([data-slot="dialog-title"]) { margin: 0; font-size: 17px; font-weight: 680; }
.workspace-confirm-dialog :deep([data-slot="dialog-description"]) { margin-top: 8px; color: var(--muted); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) {
  .workspace-header { align-items: flex-start; flex-direction: column; }
  .workspace-invitation-form { grid-template-columns: 1fr; }
  .workspace-section { padding: 15px 13px; }
  .workspace-desktop-list { display: none; }
  .workspace-mobile-list { display: grid; gap: 8px; }
}
</style>
