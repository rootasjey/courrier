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
      <p v-else-if="failed && !overview" class="admin-state admin-state-error" role="alert">
        {{ $t(loadFailure === 'access' ? 'admin.accessError' : loadFailure === 'response' ? 'admin.unexpectedResponse' : 'admin.error') }}
      </p>
      <template v-else-if="overview">
        <section class="admin-metrics" :aria-label="$t('admin.title')">
          <article class="admin-metric"><span>{{ $t('admin.workspaces') }}</span><strong>{{ overview.counts.workspace_count }}</strong></article>
          <article class="admin-metric"><span>{{ $t('admin.domains') }}</span><strong>{{ overview.counts.domain_count }}</strong></article>
          <article class="admin-metric"><span>{{ $t('admin.memberships') }}</span><strong>{{ overview.counts.membership_count }}</strong></article>
          <article class="admin-metric"><span>{{ $t('admin.pendingInvitations') }}</span><strong>{{ overview.counts.pending_invitation_count }}</strong></article>
        </section>

        <section v-if="platformAdminState" class="admin-section" aria-labelledby="admin-platform-admins-heading">
          <h2 id="admin-platform-admins-heading">{{ $t('admin.platformAdmins') }}</h2>
          <p class="admin-section-description">{{ $t('admin.platformAdminsDescription') }}</p>
          <p v-if="platformAdminError" class="admin-access-error" role="alert">{{ platformAdminError }}</p>
          <p v-if="platformAdminNotice" class="admin-access-notice" role="status">{{ platformAdminNotice }}</p>
          <p v-if="platformAdminState.candidatesTruncated" class="admin-access-notice" role="status">{{ $t('admin.platformAdminCandidatesTruncated') }}</p>

          <div class="admin-access-controls admin-platform-admin-controls">
            <label class="admin-access-field">
              <span>{{ $t('admin.platformAdminCandidate') }}</span>
              <select v-model="platformAdminCandidateId" :disabled="platformAdminBusy || !platformAdminState.candidates.length">
                <option value="">{{ $t(platformAdminState.candidates.length ? 'admin.choosePlatformAdminCandidate' : 'admin.noPlatformAdminCandidates') }}</option>
                <option v-for="candidate in platformAdminState.candidates" :key="candidate.user_id" :value="candidate.user_id">
                  {{ candidate.display_name || candidate.email }} · {{ candidate.email }}
                </option>
              </select>
            </label>
            <button class="admin-access-action" type="button" :disabled="platformAdminBusy || !platformAdminCandidateId" @click="preparePlatformAdminGrant">
              {{ $t('admin.grantPlatformAdmin') }}
            </button>
          </div>

          <div class="admin-table-wrap admin-access-table">
            <table>
              <thead><tr><th>{{ $t('admin.user') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.platformAdminSince') }}</th><th>{{ $t('admin.grantedBy') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
              <tbody>
                <tr v-for="admin in platformAdminState.admins" :key="admin.user_id">
                  <td><strong>{{ admin.display_name || admin.email }}</strong><small>{{ admin.email }}</small></td>
                  <td><span class="admin-status" :class="`is-${admin.user_status}`">{{ statusLabel(admin.user_status) }}</span></td>
                  <td>{{ formatDate(admin.created_at) }}</td>
                  <td>{{ admin.created_by_email || '—' }}</td>
                  <td>
                    <span v-if="admin.user_id === platformAdminState.actorUserId" class="admin-access-protected">{{ $t('admin.currentPlatformAdminProtected') }}</span>
                    <div v-else class="admin-domain-row-actions">
                      <button
                        v-if="admin.user_status === 'active'"
                        class="admin-membership-action is-reactivate"
                        type="button"
                        :disabled="platformAdminBusy"
                        @click="preparePlatformAdminMfaRecovery(admin)"
                      >
                        {{ $t('admin.recoverPlatformAdminMfa') }}
                      </button>
                      <span v-if="admin.user_status === 'active' && activePlatformAdminCount <= 1" class="admin-access-protected">{{ $t('admin.lastPlatformAdminProtected') }}</span>
                      <button v-else class="admin-membership-action is-suspend" type="button" :disabled="platformAdminBusy" @click="platformAdminToRevoke = admin">
                        {{ $t('admin.revokePlatformAdmin') }}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!platformAdminState.admins.length"><td colspan="5" class="admin-empty">{{ $t('admin.noPlatformAdmins') }}</td></tr>
              </tbody>
            </table>
          </div>
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

        <AdminDomainsSection
          :active-workspaces="activeWorkspaces"
          :domains="overview.domains"
          :admin-fetch="adminFetch"
          :format-date="formatDate"
          :status-label="statusLabel"
          @refresh="loadOverview"
          @select-mailbox-domain="suggestedMailboxDomainId = $event"
        />

        <AdminMailboxesSection
          :domains="verifiedDomains"
          :members="mailboxAccess?.members ?? []"
          :members-truncated="mailboxAccess?.truncated.members ?? false"
          :admin-fetch="adminFetch"
          :suggested-domain-id="suggestedMailboxDomainId"
          @refresh="loadOverview"
        />

        <AdminBlockedSendersSection
          :senders="overview.blockedSenders"
          :truncated="overview.blockedSendersTruncated"
          :admin-fetch="adminFetch"
          :format-date="formatDate"
          @refresh="loadOverview"
        />

        <AdminForwardRecoverySection
          :deliveries="forwardDeliveries"
          :has-more="Boolean(forwardDeliveryCursor)"
          :loading-more="forwardDeliveryPageLoading"
          :load-more-error="forwardDeliveryPageError"
          :admin-fetch="adminFetch"
          :format-date="formatDate"
          @refresh="loadOverview"
          @load-more="loadMoreForwardDeliveries"
        />

        <AdminInboundEmailEventsSection
          :events="overview.inboundEmailEvents"
          :truncated="overview.inboundEmailEventsTruncated"
          :format-date="formatDate"
        />

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
                  <td><span class="admin-role">{{ roleLabel(membership.role) }}</span></td>
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
          <p class="admin-section-description">{{ $t('admin.invitationDescription') }}</p>
          <p v-if="invitationError" class="admin-access-error" role="alert">{{ invitationError }}</p>
          <p v-if="invitationNotice" class="admin-access-notice" role="status">{{ invitationNotice }}</p>
          <form class="admin-domain-controls admin-invitation-controls" @submit.prevent="createInvitation">
            <label class="admin-access-field">
              <span>{{ $t('admin.workspace') }}</span>
              <select v-model="invitationWorkspaceId" :disabled="invitationBusy || !activeWorkspaces.length" required>
                <option value="">{{ $t('admin.chooseWorkspace') }}</option>
                <option v-for="workspace in activeWorkspaces" :key="workspace.id" :value="workspace.id">
                  {{ workspace.name }}
                </option>
              </select>
            </label>
            <label class="admin-access-field">
              <span>{{ $t('admin.email') }}</span>
              <input v-model="invitationEmail" type="email" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false" :placeholder="$t('admin.invitationEmailPlaceholder')" :disabled="invitationBusy" required>
            </label>
            <label class="admin-access-field">
              <span>{{ $t('admin.role') }}</span>
              <select v-model="invitationRole" :disabled="invitationBusy">
                <option value="member">{{ $t('admin.roleMember') }}</option>
                <option value="viewer">{{ $t('admin.roleViewer') }}</option>
              </select>
            </label>
            <button class="admin-access-action" type="submit" :disabled="invitationBusy || !invitationWorkspaceId || !invitationEmail.trim()">
              {{ invitationBusy ? $t('admin.sendingInvitation') : $t('admin.sendInvitation') }}
            </button>
          </form>
          <div class="admin-table-wrap">
            <table>
              <thead><tr><th>{{ $t('admin.email') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.role') }}</th><th>{{ $t('admin.status') }}</th><th>{{ $t('admin.expires') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
              <tbody>
                <tr v-for="invitation in overview.invitations" :key="invitation.id">
                  <td>{{ invitation.email }}</td><td>{{ invitation.workspace_name }}</td><td>{{ roleLabel(invitation.role) }}</td>
                  <td><span class="admin-status" :class="`is-${invitation.status}`">{{ statusLabel(invitation.status) }}</span></td><td>{{ formatDate(invitation.expires_at) }}</td>
                  <td><button v-if="invitation.status === 'pending'" class="admin-membership-action is-suspend" type="button" :disabled="invitationBusy" @click="invitationToRevoke = invitation">{{ $t('admin.revokeInvitation') }}</button><span v-else class="admin-access-protected">—</span></td>
                </tr>
                <tr v-if="!overview.invitations.length"><td colspan="6" class="admin-empty">{{ $t('admin.noRows') }}</td></tr>
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
      :open="Boolean(invitationToRevoke)"
      :title="$t('admin.revokeInvitation')"
      :description="$t('admin.revokeInvitationDescription', { email: invitationToRevoke?.email || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !invitationBusy) invitationToRevoke = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.revokeInvitation') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.revokeInvitationDescription', { email: invitationToRevoke?.email || '' }) }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="invitationBusy" @click="invitationToRevoke = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="invitationBusy" @click="revokeInvitation">
            {{ invitationBusy ? $t('admin.sendingInvitation') : $t('admin.revokeInvitation') }}
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
      :open="Boolean(platformAdminToGrant)"
      :title="$t('admin.grantPlatformAdmin')"
      :description="$t('admin.grantPlatformAdminDescription', { email: platformAdminToGrant?.email || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !platformAdminBusy) platformAdminToGrant = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.grantPlatformAdmin') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.grantPlatformAdminDescription', { email: platformAdminToGrant?.email || '' }) }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="platformAdminBusy" @click="platformAdminToGrant = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-save" type="button" :disabled="platformAdminBusy" @click="grantPlatformAdmin">
            {{ platformAdminBusy ? $t('admin.savingPlatformAdmin') : $t('admin.grantPlatformAdmin') }}
          </button>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="Boolean(platformAdminToRevoke)"
      :title="$t('admin.revokePlatformAdmin')"
      :description="$t('admin.revokePlatformAdminDescription', { email: platformAdminToRevoke?.email || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !platformAdminBusy) platformAdminToRevoke = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.revokePlatformAdmin') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.revokePlatformAdminDescription', { email: platformAdminToRevoke?.email || '' }) }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="platformAdminBusy" @click="platformAdminToRevoke = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="platformAdminBusy" @click="revokePlatformAdmin">
            {{ platformAdminBusy ? $t('admin.savingPlatformAdmin') : $t('admin.revokePlatformAdmin') }}
          </button>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="Boolean(platformAdminMfaRecoveryTarget)"
      :title="$t('admin.recoverPlatformAdminMfa')"
      :description="$t('admin.recoverPlatformAdminMfaDescription', { email: platformAdminMfaRecoveryTarget?.email || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !platformAdminBusy) closePlatformAdminMfaRecovery() }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.recoverPlatformAdminMfa') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.recoverPlatformAdminMfaDescription', { email: platformAdminMfaRecoveryTarget?.email || '' }) }}</NDialogDescription>
        </header>
        <form class="admin-mfa-recovery-form" @submit.prevent="recoverPlatformAdminMfa">
          <label class="admin-access-field">
            <span>{{ $t('admin.confirmPlatformAdminEmail') }}</span>
            <input
              v-model="platformAdminMfaRecoveryConfirmation"
              type="text"
              inputmode="email"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :placeholder="platformAdminMfaRecoveryTarget?.email || ''"
              :disabled="platformAdminBusy"
            >
          </label>
          <p v-if="platformAdminMfaRecoveryError" class="dialog-error" role="alert">{{ platformAdminMfaRecoveryError }}</p>
          <div class="dialog-actions">
            <button class="dialog-cancel" type="button" :disabled="platformAdminBusy" @click="closePlatformAdminMfaRecovery">{{ $t('common.cancel') }}</button>
            <button class="dialog-danger" type="submit" :disabled="platformAdminBusy || !canConfirmPlatformAdminMfaRecovery">
              {{ platformAdminBusy ? $t('admin.recoveringPlatformAdminMfa') : $t('admin.recoverPlatformAdminMfa') }}
            </button>
          </div>
        </form>
      </template>
    </NDialog>
  </main>
</template>

<script setup lang="ts">
import AdminDomainsSection from '~/components/AdminDomainsSection.vue'
import AdminMailboxesSection from '~/components/AdminMailboxesSection.vue'
import AdminForwardRecoverySection from '~/components/AdminForwardRecoverySection.vue'
import { createAdminAuthorizationRecovery } from '../utils/admin-authorization-recovery.mjs'
import { getAdminAuthorizationRedirect } from '../utils/admin-authorization-redirect.mjs'

definePageMeta({ pageTransition: false })

type AdminMembership = { id: string, workspace_id: string, workspace_name: string, user_id: string, email: string, display_name: string, user_status: string, role: string, membership_status: string, created_at: string, is_last_active_owner: number }
type ForwardDelivery = { id: string, status: 'processing' | 'failed', attempt_count: number, claimed_at: string | null, forwarded_at: string | null, last_error: string | null, delivery_method: string, subject: string, sender_address: string, mailbox_address: string, destination: string, received_at: string }
type AdminOverview = {
  counts: { workspace_count: number, domain_count: number, membership_count: number, pending_invitation_count: number }
  workspaces: { id: string, name: string, status: string, created_at: string, domain_count: number, mailbox_count: number, member_count: number }[]
  domains: { id: string, workspace_id: string, workspace_name: string, domain: string, verification_status: string, verified_at: string | null, mailbox_count: number }[]
  memberships: AdminMembership[]
  invitations: { id: string, workspace_id: string, workspace_name: string, email: string, role: string, expires_at: string, accepted_at: string | null, revoked_at: string | null, created_at: string, status: string }[]
  audit: { id: string, actor_user_id: string | null, actor_email: string | null, action: string, target_type: string, target_id: string | null, workspace_id: string | null, created_at: string }[]
  blockedSenders: { mailbox_domain: string, sender_address: string, created_at: string, created_by_user_id: string | null, blocked_by_email: string | null, workspace_id: string | null, workspace_name: string | null }[]
  blockedSendersTruncated: boolean
  inboundEmailEvents: { id: string, event_type: 'rejected' | 'degraded' | 'failed', reason_code: 'sender_blocked' | 'mailbox_unconfigured' | 'mail_storage_unavailable' | 'processing_failed', sender_address: string, recipient_address: string, created_at: string }[]
  inboundEmailEventsTruncated: boolean
}
type PlatformAdmin = { user_id: string, email: string, display_name: string, user_status: string, created_at: string, created_by_user_id: string | null, created_by_email: string | null }
type PlatformAdminCandidate = { user_id: string, email: string, display_name: string }
type PlatformAdminState = { actorUserId: string, admins: PlatformAdmin[], candidates: PlatformAdminCandidate[], candidatesTruncated: boolean }
type MailboxAccess = {
  mailboxes: { id: string, workspace_id: string, workspace_name: string, address: string }[]
  members: { workspace_id: string, user_id: string, email: string, display_name: string | null, role: string }[]
  grants: { workspace_id: string, mailbox_id: string, user_id: string }[]
  truncated: { mailboxes: boolean, members: boolean, grants: boolean }
}
type ForwardDeliveryState = { deliveries: ForwardDelivery[], limit: number, nextCursor: string | null }
type AdminSnapshot = { overview: AdminOverview, mailboxAccess: MailboxAccess, platformAdminState: PlatformAdminState, forwardDeliveryState: ForwardDeliveryState }
type AccessGrant = { mailbox_id: string, user_id: string, email: string, display_name: string | null, role: string, mailbox_address: string }
type AdminAccountSession = {
  user: { id: string, email: string, displayName: string }
  activeWorkspaceId: string | null
  isPlatformAdmin: boolean
  hasPasskeys: boolean
  adminMfaConfigured: boolean
  requiresAdminMfa: boolean
  adminMfaVerified: boolean
}

const { $t } = useI18n()
const accountSession = useState<AdminAccountSession | null>('courrier-account-session', () => null)
const overview = ref<AdminOverview | null>(null)
const suggestedMailboxDomainId = ref<string | null>(null)
const mailboxAccess = ref<MailboxAccess | null>(null)
const platformAdminState = ref<PlatformAdminState | null>(null)
const forwardDeliveries = ref<ForwardDelivery[]>([])
const forwardDeliveryCursor = ref<string | null>(null)
const forwardDeliveryPageLoading = ref(false)
const forwardDeliveryPageError = ref('')
const loading = ref(true)
let loadInProgress = false
const failed = ref(false)
const loadFailure = ref<'access' | 'response' | 'generic'>('generic')
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
const invitationWorkspaceId = ref('')
const invitationEmail = ref('')
const invitationRole = ref<'member' | 'viewer'>('member')
const invitationBusy = ref(false)
const invitationError = ref('')
const invitationNotice = ref('')
const invitationToRevoke = ref<AdminOverview['invitations'][number] | null>(null)
const platformAdminCandidateId = ref('')
const platformAdminBusy = ref(false)
const platformAdminError = ref('')
const platformAdminNotice = ref('')
const platformAdminToGrant = ref<PlatformAdminCandidate | null>(null)
const platformAdminToRevoke = ref<PlatformAdmin | null>(null)
const platformAdminMfaRecoveryTarget = ref<PlatformAdmin | null>(null)
const platformAdminMfaRecoveryConfirmation = ref('')
const platformAdminMfaRecoveryError = ref('')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAdminOverviewResponse(value: unknown): value is AdminOverview {
  if (!isRecord(value) || !isRecord(value.counts)) return false
  const countKeys = ['workspace_count', 'domain_count', 'membership_count', 'pending_invitation_count']
  return countKeys.every(key => typeof value.counts[key] === 'number')
    && ['workspaces', 'domains', 'memberships', 'invitations', 'audit', 'blockedSenders', 'inboundEmailEvents'].every(key => Array.isArray(value[key]))
    && typeof value.blockedSendersTruncated === 'boolean'
    && typeof value.inboundEmailEventsTruncated === 'boolean'
}

function isMailboxAccessResponse(value: unknown): value is MailboxAccess {
  return isRecord(value)
    && ['mailboxes', 'members', 'grants'].every(key => Array.isArray(value[key]))
    && isRecord(value.truncated)
}

function isPlatformAdminStateResponse(value: unknown): value is PlatformAdminState {
  return isRecord(value)
    && typeof value.actorUserId === 'string'
    && Array.isArray(value.admins)
    && Array.isArray(value.candidates)
    && typeof value.candidatesTruncated === 'boolean'
}

function isForwardDeliveryStateResponse(value: unknown): value is ForwardDeliveryState {
  return isRecord(value)
    && Array.isArray(value.deliveries)
    && typeof value.limit === 'number'
    && (value.nextCursor === null || typeof value.nextCursor === 'string')
}

function getHttpStatus(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const value = error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  return Number(value.statusCode || value.status || value.response?.status || 0)
}

function clearAdminData() {
  overview.value = null
  mailboxAccess.value = null
  platformAdminState.value = null
  forwardDeliveries.value = []
  forwardDeliveryCursor.value = null
  forwardDeliveryPageLoading.value = false
  forwardDeliveryPageError.value = ''
  selectedMailboxId.value = ''
  selectedUserId.value = ''
  invitationWorkspaceId.value = ''
  platformAdminCandidateId.value = ''
  invitationEmail.value = ''
  invitationRole.value = 'member'
  invitationToRevoke.value = null
  membershipToChange.value = null
  accessToRevoke.value = null
  platformAdminToGrant.value = null
  platformAdminToRevoke.value = null
  platformAdminMfaRecoveryTarget.value = null
  platformAdminMfaRecoveryConfirmation.value = ''
  platformAdminMfaRecoveryError.value = ''
  accessError.value = ''
  accessNotice.value = ''
  membershipError.value = ''
  membershipNotice.value = ''
  invitationError.value = ''
  invitationNotice.value = ''
  platformAdminError.value = ''
  platformAdminNotice.value = ''
}

const recoverAdminAuthorization = createAdminAuthorizationRecovery({
  refreshSession: () => $fetch<AdminAccountSession>('/api/account/session'),
  setSession: (session: AdminAccountSession | null) => { accountSession.value = session },
  clearAdminData,
  markAuthorizationFailure: () => {
    failed.value = true
    loadFailure.value = 'access'
    loading.value = false
  },
  navigate: (redirect, options) => navigateTo(redirect, options),
  getRedirect: getAdminAuthorizationRedirect,
})

async function handleAdminAuthorizationFailure(error: unknown) {
  return await recoverAdminAuthorization(getHttpStatus(error))
}

async function adminFetch<T>(request: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
  try {
    return await $fetch<T>(request, options)
  } catch (error) {
    await handleAdminAuthorizationFailure(error)
    throw error
  }
}

async function loadMoreForwardDeliveries() {
  const cursor = forwardDeliveryCursor.value
  if (!cursor || forwardDeliveryPageLoading.value) return

  forwardDeliveryPageLoading.value = true
  forwardDeliveryPageError.value = ''
  try {
    const request = `/api/admin/legacy-forward-deliveries?cursor=${encodeURIComponent(cursor)}`
    const nextPage = await adminFetch<ForwardDeliveryState>(request)
    if (!isForwardDeliveryStateResponse(nextPage)) throw new Error('ADMIN_FORWARD_RECOVERY_RESPONSE_INVALID')

    const seenIds = new Set(forwardDeliveries.value.map(delivery => delivery.id))
    forwardDeliveries.value = [
      ...forwardDeliveries.value,
      ...nextPage.deliveries.filter(delivery => !seenIds.has(delivery.id)),
    ]
    forwardDeliveryCursor.value = nextPage.nextCursor
  } catch {
    forwardDeliveryPageError.value = $t('admin.forwardRecoveryLoadMoreError')
  } finally {
    forwardDeliveryPageLoading.value = false
  }
}

const activeWorkspaces = computed(() => overview.value?.workspaces.filter(workspace => workspace.status === 'active') ?? [])
const verifiedDomains = computed(() => overview.value?.domains.filter(domain => domain.verification_status === 'verified') ?? [])
const activePlatformAdminCount = computed(() => platformAdminState.value?.admins.filter(admin => admin.user_status === 'active').length ?? 0)
const selectedPlatformAdminCandidate = computed(() => platformAdminState.value?.candidates.find(candidate => candidate.user_id === platformAdminCandidateId.value) ?? null)
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

const adminSnapshotKey = `admin-console:${accountSession.value?.user.id ?? 'unknown'}`
const {
  data: initialAdminSnapshot,
  error: initialAdminError,
  status: initialAdminStatus,
  refresh: refreshAdminSnapshot,
} = await useAsyncData<AdminSnapshot>(
  adminSnapshotKey,
  async (_nuxtApp, { signal }) => {
    const [nextOverview, nextMailboxAccess, nextPlatformAdminState, nextForwardDeliveryState] = await Promise.all([
      $fetch<AdminOverview>('/api/admin/overview', { signal }),
      $fetch<MailboxAccess>('/api/admin/mailbox-access', { signal }),
      $fetch<PlatformAdminState>('/api/admin/platform-admins', { signal }),
      $fetch<ForwardDeliveryState>('/api/admin/legacy-forward-deliveries', { signal }),
    ])

    if (!isAdminOverviewResponse(nextOverview)
      || !isMailboxAccessResponse(nextMailboxAccess)
      || !isPlatformAdminStateResponse(nextPlatformAdminState)
      || !isForwardDeliveryStateResponse(nextForwardDeliveryState)) {
      throw new Error('ADMIN_RESPONSE_INVALID')
    }

    return {
      overview: nextOverview,
      mailboxAccess: nextMailboxAccess,
      platformAdminState: nextPlatformAdminState,
      forwardDeliveryState: nextForwardDeliveryState,
    }
  },
  { server: false, deep: false },
)

function applyAdminSnapshot(snapshot: AdminSnapshot) {
  overview.value = snapshot.overview
  mailboxAccess.value = snapshot.mailboxAccess
  platformAdminState.value = snapshot.platformAdminState
  forwardDeliveries.value = snapshot.forwardDeliveryState.deliveries
  forwardDeliveryCursor.value = snapshot.forwardDeliveryState.nextCursor
  forwardDeliveryPageError.value = ''

  if (!activeWorkspaces.value.some(workspace => workspace.id === invitationWorkspaceId.value)) {
    invitationWorkspaceId.value = activeWorkspaces.value[0]?.id ?? ''
  }
  if (!snapshot.mailboxAccess.mailboxes.some(mailbox => mailbox.id === selectedMailboxId.value)) {
    selectedMailboxId.value = snapshot.mailboxAccess.mailboxes[0]?.id ?? ''
  }
  if (!availableMembers.value.some(member => member.user_id === selectedUserId.value)) selectedUserId.value = ''
  if (!snapshot.platformAdminState.candidates.some(candidate => candidate.user_id === platformAdminCandidateId.value)) platformAdminCandidateId.value = ''
}

watch(initialAdminStatus, (status) => {
  if (status === 'pending') {
    loading.value = true
    failed.value = false
  }
}, { immediate: true })

watch(initialAdminSnapshot, (snapshot) => {
  if (!snapshot) return
  applyAdminSnapshot(snapshot)
  failed.value = false
  loading.value = false
}, { immediate: true })

watch(initialAdminError, (error) => {
  if (!error) return
  failed.value = true
  loadFailure.value = error.message === 'ADMIN_RESPONSE_INVALID'
    ? 'response'
    : [401, 403].includes(getHttpStatus(error)) ? 'access' : 'generic'
  loading.value = false
  if ([401, 403].includes(getHttpStatus(error))) void handleAdminAuthorizationFailure(error)
}, { immediate: true })

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

function roleLabel(role: string) {
  const known = ['owner', 'admin', 'member', 'viewer']
  return known.includes(role) ? $t(`admin.role${role[0]!.toUpperCase()}${role.slice(1)}`) : role
}

function formatDate(value: string) {
  const date = new Date(value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

async function loadOverview() {
  if (loadInProgress) return
  loadInProgress = true
  loading.value = true
  failed.value = false
  loadFailure.value = 'generic'
  try {
    await refreshAdminSnapshot()
    if (initialAdminError.value) {
      failed.value = true
      const status = getHttpStatus(initialAdminError.value)
      loadFailure.value = initialAdminError.value.message === 'ADMIN_RESPONSE_INVALID'
        ? 'response'
        : status === 401 || status === 403 ? 'access' : 'generic'
      return
    }
    if (initialAdminSnapshot.value) applyAdminSnapshot(initialAdminSnapshot.value)
  } catch (error) {
    failed.value = true
    const status = getHttpStatus(error)
    loadFailure.value = status === 401 || status === 403 ? 'access' : 'generic'
    if (status === 401 || status === 403) await handleAdminAuthorizationFailure(error)
  } finally {
    loading.value = false
    loadInProgress = false
  }
}

function preparePlatformAdminGrant() {
  const candidate = selectedPlatformAdminCandidate.value
  if (candidate && !platformAdminBusy.value) platformAdminToGrant.value = candidate
}

const canConfirmPlatformAdminMfaRecovery = computed(() => {
  const target = platformAdminMfaRecoveryTarget.value
  return Boolean(target && platformAdminMfaRecoveryConfirmation.value.trim().toLowerCase() === target.email.trim().toLowerCase())
})

function preparePlatformAdminMfaRecovery(admin: PlatformAdmin) {
  if (admin.user_status !== 'active' || admin.user_id === platformAdminState.value?.actorUserId || platformAdminBusy.value) return
  platformAdminMfaRecoveryTarget.value = admin
  platformAdminMfaRecoveryConfirmation.value = ''
  platformAdminMfaRecoveryError.value = ''
}

function closePlatformAdminMfaRecovery() {
  platformAdminMfaRecoveryTarget.value = null
  platformAdminMfaRecoveryConfirmation.value = ''
  platformAdminMfaRecoveryError.value = ''
}

async function recoverPlatformAdminMfa() {
  const target = platformAdminMfaRecoveryTarget.value
  if (!target || !canConfirmPlatformAdminMfaRecovery.value || platformAdminBusy.value) return
  platformAdminBusy.value = true
  platformAdminMfaRecoveryError.value = ''
  platformAdminNotice.value = ''
  try {
    const path = '/api/admin/platform-admins/' + encodeURIComponent(target.user_id) + '/mfa-recovery'
    await adminFetch(path, {
      method: 'POST',
      body: { confirmationEmail: platformAdminMfaRecoveryConfirmation.value },
    })
    closePlatformAdminMfaRecovery()
    platformAdminNotice.value = $t('admin.platformAdminMfaRecoveredNotice', { email: target.email })
    await loadOverview()
  } catch (error) {
    const status = requestStatus(error)
    platformAdminMfaRecoveryError.value = status === 400 ? $t('admin.platformAdminMfaConfirmationError')
      : status === 403 ? $t('admin.platformAdminMfaReverifyError')
      : status === 404 || status === 409 ? $t('admin.platformAdminConflict')
      : $t('admin.platformAdminMfaRecoveryError')
  } finally {
    platformAdminBusy.value = false
  }
}

async function grantPlatformAdmin() {
  const candidate = platformAdminToGrant.value
  if (!candidate || platformAdminBusy.value) return
  platformAdminBusy.value = true
  platformAdminError.value = ''
  platformAdminNotice.value = ''
  try {
    await adminFetch('/api/admin/platform-admins', { method: 'POST', body: { userId: candidate.user_id } })
    platformAdminToGrant.value = null
    platformAdminCandidateId.value = ''
    platformAdminNotice.value = $t('admin.platformAdminGrantedNotice', { email: candidate.email })
    await loadOverview()
  } catch (error) {
    const status = requestStatus(error)
    platformAdminError.value = status === 409 ? $t('admin.platformAdminConflict')
      : status === 404 ? $t('admin.platformAdminNotFound')
      : $t('admin.platformAdminSaveError')
  } finally {
    platformAdminBusy.value = false
  }
}

async function revokePlatformAdmin() {
  const admin = platformAdminToRevoke.value
  if (!admin || platformAdminBusy.value) return
  platformAdminBusy.value = true
  platformAdminError.value = ''
  platformAdminNotice.value = ''
  try {
    await adminFetch(`/api/admin/platform-admins/${encodeURIComponent(admin.user_id)}`, { method: 'DELETE' })
    platformAdminToRevoke.value = null
    platformAdminNotice.value = $t('admin.platformAdminRevokedNotice', { email: admin.email })
    await loadOverview()
  } catch (error) {
    platformAdminError.value = requestStatus(error) === 409
      ? $t('admin.platformAdminConflict')
      : $t('admin.platformAdminSaveError')
  } finally {
    platformAdminBusy.value = false
  }
}

function requestStatus(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const value = error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  return Number(value.statusCode || value.status || value.response?.status || 0)
}

async function createInvitation() {
  if (!invitationWorkspaceId.value || !invitationEmail.value.trim() || invitationBusy.value) return
  invitationBusy.value = true
  invitationError.value = ''
  invitationNotice.value = ''
  try {
    const result = await adminFetch<{ email: string }>('/api/admin/invitations', {
      method: 'POST',
      body: { workspaceId: invitationWorkspaceId.value, email: invitationEmail.value, role: invitationRole.value },
    })
    invitationEmail.value = ''
    invitationNotice.value = $t('admin.invitationSent', { email: result.email })
    await loadOverview()
  } catch (error) {
    const status = requestStatus(error)
    invitationError.value = status === 409 ? $t('admin.invitationConflict')
      : status === 429 ? $t('admin.invitationRateLimit')
      : status === 503 || status === 502 ? $t('admin.invitationSendError')
        : $t('admin.invitationError')
  } finally {
    invitationBusy.value = false
  }
}

async function revokeInvitation() {
  const invitation = invitationToRevoke.value
  if (!invitation || invitationBusy.value) return
  invitationBusy.value = true
  invitationError.value = ''
  invitationNotice.value = ''
  try {
    await adminFetch(`/api/admin/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' })
    invitationToRevoke.value = null
    invitationNotice.value = $t('admin.invitationRevokedNotice')
    await loadOverview()
  } catch {
    invitationError.value = $t('admin.invitationError')
  } finally {
    invitationBusy.value = false
  }
}

async function grantSelectedAccess() {
  if (!selectedMailbox.value || !selectedUserId.value || accessBusy.value) return
  accessBusy.value = true
  accessError.value = ''
  accessNotice.value = ''
  try {
    await adminFetch('/api/admin/mailbox-access', {
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
    await adminFetch('/api/admin/mailbox-access', {
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
    await adminFetch(`/api/admin/memberships/${encodeURIComponent(membership.id)}`, {
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

</script>
