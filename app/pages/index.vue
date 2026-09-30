<script setup lang="ts">
import { mailboxPath } from '~/utils/mailbox-routing'

await navigateTo(mailboxPath('Imbox'), { replace: true })
</script>
