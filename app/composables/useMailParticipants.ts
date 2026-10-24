import { computed, ref, watch, type ComputedRef } from 'vue'

type ParticipantMessage = {
  address: string
  sender: string
  color: string
  isOutgoing: boolean
  recipient: string
}

type ParticipantThread = {
  messages: ParticipantMessage[]
  latest: ParticipantMessage
}

type Participant = {
  address: string
  name: string
  initials: string
  color: 'terracotta' | 'blue' | 'green' | 'gold'
  avatarUrl?: string | null
  logoUrl?: string | null
}

type Avatar = { avatarUrl: string | null, logoUrl: string | null }

export function useMailParticipants(options: {
  messagesForAvatarLookup: ComputedRef<ParticipantMessage[]>
  accountEmail: ComputedRef<string>
}) {
  const participantAvatars = ref<Record<string, Avatar>>({})
  const currentAddress = computed(() => options.accountEmail.value.trim().toLocaleLowerCase('en-US'))
  let requestId = 0

  function recipientAddresses(value: string) {
    const matches = value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || []
    return [...new Set(matches.map(address => address.trim().toLocaleLowerCase('en-US')))]
  }

  const participantAddresses = computed(() => {
    const addresses = options.messagesForAvatarLookup.value.flatMap((message) => {
      const senderAddress = message.address.trim().toLocaleLowerCase('en-US')
      return [
        ...(!message.isOutgoing && senderAddress !== currentAddress.value ? [senderAddress] : []),
        ...recipientAddresses(message.recipient).filter(address => address !== currentAddress.value),
      ]
    })
    return [...new Set(addresses.filter(Boolean))].sort()
  })

  watch(participantAddresses, async (addresses) => {
    const currentRequestId = ++requestId
    if (!addresses.length) {
      participantAvatars.value = {}
      return
    }

    try {
      const chunks: string[][] = []
      for (let index = 0; index < addresses.length; index += 30) chunks.push(addresses.slice(index, index + 30))
      const responses = await Promise.all(chunks.map(chunk => $fetch<{ avatars: Record<string, Avatar> }>('/api/contacts/avatars', {
        query: { addresses: chunk.join(',') },
      })))
      if (currentRequestId === requestId) {
        participantAvatars.value = Object.assign({}, ...responses.map(response => response.avatars))
      }
    } catch {
      // Keep initials visible when the contact lookup is temporarily unavailable.
    }
  }, { immediate: true })

  function threadParticipants(thread: ParticipantThread): Participant[] {
    const participants = new Map<string, Omit<Participant, 'initials'>>()
    const colors: Participant['color'][] = ['terracotta', 'blue', 'green', 'gold']
    const stableColor = (address: string, preferred?: string): Participant['color'] => {
      if (preferred && colors.includes(preferred as Participant['color'])) return preferred as Participant['color']
      const hash = [...address].reduce((value, char) => (value * 31 + char.charCodeAt(0)) | 0, 7)
      return colors[Math.abs(hash) % colors.length]!
    }

    for (const message of thread.messages) {
      const senderAddress = message.address.trim().toLocaleLowerCase('en-US')
      if (!message.isOutgoing && senderAddress && senderAddress !== currentAddress.value && !participants.has(senderAddress)) {
        participants.set(senderAddress, { address: senderAddress, name: message.sender || senderAddress, color: stableColor(senderAddress, message.color) })
      }

      for (const address of recipientAddresses(message.recipient)) {
        if (address === currentAddress.value || participants.has(address)) continue
        const knownSender = thread.messages.find(candidate => candidate.address.trim().toLocaleLowerCase('en-US') === address)
        participants.set(address, { address, name: knownSender?.sender || address, color: stableColor(address, knownSender?.color) })
      }
    }

    return [...participants.values()].map((participant) => {
      const words = participant.name.split(/\s+/).filter(Boolean)
      const initials = words.length > 1
        ? `${words[0]?.[0] || ''}${words.at(-1)?.[0] || ''}`
        : (words[0] || participant.address).slice(0, 2)
      return {
        ...participant,
        initials: initials.toLocaleUpperCase('fr'),
        ...participantAvatars.value[participant.address],
      }
    })
  }

  function otherThreadParticipants(thread: ParticipantThread) {
    const latestSender = thread.latest.address.trim().toLocaleLowerCase('en-US')
    return threadParticipants(thread).filter(participant => participant.address !== latestSender)
  }

  function senderAvatarFor(message: ParticipantMessage) {
    if (message.isOutgoing) return {}
    return participantAvatars.value[message.address.trim().toLocaleLowerCase('en-US')] ?? {}
  }

  function threadAvatarFor(message: ParticipantMessage) {
    const address = message.isOutgoing
      ? recipientAddresses(message.recipient)[0]
      : message.address.trim().toLocaleLowerCase('en-US')
    return address ? participantAvatars.value[address] ?? {} : {}
  }

  return {
    recipientAddresses,
    threadParticipants,
    otherThreadParticipants,
    senderAvatarFor,
    threadAvatarFor,
  }
}
