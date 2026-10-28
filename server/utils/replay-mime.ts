const MAILBOX_ADDRESS = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i
const REPLACED_HEADERS = /^(?:From|Reply-To|X-Courrier-Original-From|DKIM-Signature|DomainKey-Signature|ARC-(?:Seal|Message-Signature|Authentication-Results)|Authentication-Results|Received-SPF|X-[A-Z0-9-]*DKIM[A-Z0-9-]*Signature):/i

function getHeaderBoundary(rawMessage: Uint8Array) {
  for (let index = 0; index < rawMessage.length - 1; index++) {
    if (rawMessage[index] === 10 && rawMessage[index + 1] === 10) {
      return { headerEnd: index, bodyStart: index + 2, lineEnding: '\n' }
    }
    if (
      rawMessage[index] === 13
      && rawMessage[index + 1] === 10
      && rawMessage[index + 2] === 13
      && rawMessage[index + 3] === 10
    ) {
      return { headerEnd: index, bodyStart: index + 4, lineEnding: '\r\n' }
    }
  }

  throw new Error('The stored message has no MIME header/body separator.')
}

export function prepareReplayMime(
  rawMessage: Uint8Array,
  senderAddress: string,
  replayFrom: string,
) {
  const localPart = senderAddress.split('@', 1)[0] ?? ''
  if (
    senderAddress.length > 254
    || !MAILBOX_ADDRESS.test(senderAddress)
    || localPart.startsWith('.')
    || localPart.endsWith('.')
    || localPart.includes('..')
  ) {
    throw new Error('The original sender address cannot be used as Reply-To.')
  }

  const { headerEnd, bodyStart, lineEnding } = getHeaderBoundary(rawMessage)
  const headerBytes = rawMessage.subarray(0, headerEnd)
  const originalHeaders = new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)
  const headers = originalHeaders.split(/\r?\n/)
  const unfoldedHeaders: string[] = []

  for (const line of headers) {
    if (/^[\t ]/.test(line) && unfoldedHeaders.length > 0) {
      unfoldedHeaders[unfoldedHeaders.length - 1] += `${lineEnding}${line}`
    } else {
      unfoldedHeaders.push(line)
    }
  }

  if (!unfoldedHeaders.some(header => /^From:/i.test(header))) {
    throw new Error('The stored message has no From header.')
  }

  const rewrittenHeaders = unfoldedHeaders.filter((header) => {
    return !REPLACED_HEADERS.test(header)
  })
  rewrittenHeaders.push(
    `From: ${replayFrom}`,
    `Reply-To: ${senderAddress}`,
    `X-Courrier-Original-From: ${senderAddress}`,
  )

  const encodedHeaders = new TextEncoder().encode(
    `${rewrittenHeaders.join(lineEnding)}${lineEnding}${lineEnding}`,
  )
  const replayMessage = new Uint8Array(encodedHeaders.length + rawMessage.length - bodyStart)
  replayMessage.set(encodedHeaders)
  replayMessage.set(rawMessage.subarray(bodyStart), encodedHeaders.length)

  return replayMessage
}
