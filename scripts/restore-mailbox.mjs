#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import PostalMime from 'postal-mime'

const FORMAT = 'courrier-mailbox-export'
const VERSION = 2
const SUPPORTED_VERSIONS = new Set([1, VERSION])
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024
const MAX_ENTRY_BYTES = 64 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
const MAILBOX_FOLDERS = new Set(['Imbox', 'The Feed', 'Paper Trail', 'Screener'])
const USER_FOLDERS = new Set(['Imbox', 'The Feed', 'Paper Trail'])
const MESSAGE_FILE_PATTERN = /^messages\/(?:[a-f0-9]{64}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.eml$/i

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let value = 0xffff_ffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffff_ffff) >>> 0
}

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  if (bytesRead !== length) throw new Error('Archive ZIP tronquée ou invalide.')
  return buffer
}

async function readCentralDirectory(handle, fileSize) {
  const tailLength = Math.min(fileSize, 22 + 0xffff)
  const tail = await readAt(handle, fileSize - tailLength, tailLength)
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const eocdIndex = tail.lastIndexOf(signature)
  if (eocdIndex < 0 || eocdIndex + 22 > tail.length) throw new Error('Fin de répertoire ZIP introuvable.')

  const eocd = tail.subarray(eocdIndex)
  const disk = eocd.readUInt16LE(4)
  const directoryDisk = eocd.readUInt16LE(6)
  const diskCount = eocd.readUInt16LE(8)
  const entryCount = eocd.readUInt16LE(10)
  const directorySize = eocd.readUInt32LE(12)
  const directoryOffset = eocd.readUInt32LE(16)
  const commentLength = eocd.readUInt16LE(20)
  if (disk || directoryDisk || diskCount !== entryCount || entryCount === 0xffff
    || directorySize === 0xffff_ffff || directoryOffset === 0xffff_ffff) {
    throw new Error('Les archives multi-disques et ZIP64 ne sont pas prises en charge.')
  }
  if (entryCount > 100_000 || directorySize > MAX_DIRECTORY_BYTES
    || eocdIndex + 22 + commentLength !== tail.length
    || directoryOffset + directorySize > fileSize - tailLength + eocdIndex) {
    throw new Error('Répertoire ZIP incohérent ou trop volumineux.')
  }

  const directory = await readAt(handle, directoryOffset, directorySize)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const entries = new Map()
  let offset = 0
  while (offset < directory.length) {
    if (directory.readUInt32LE(offset) !== 0x02014b50 || offset + 46 > directory.length) {
      throw new Error('Entrée invalide dans le répertoire ZIP.')
    }
    const flags = directory.readUInt16LE(offset + 8)
    const method = directory.readUInt16LE(offset + 10)
    const crc = directory.readUInt32LE(offset + 16)
    const compressedSize = directory.readUInt32LE(offset + 20)
    const size = directory.readUInt32LE(offset + 24)
    const nameLength = directory.readUInt16LE(offset + 28)
    const extraLength = directory.readUInt16LE(offset + 30)
    const commentBytes = directory.readUInt16LE(offset + 32)
    const diskStart = directory.readUInt16LE(offset + 34)
    const localOffset = directory.readUInt32LE(offset + 42)
    const recordLength = 46 + nameLength + extraLength + commentBytes
    if (offset + recordLength > directory.length || diskStart !== 0 || method !== 0 || flags & 1 || !(flags & 0x0800)
      || size !== compressedSize || size > MAX_ENTRY_BYTES || localOffset === 0xffff_ffff) {
      throw new Error('Archive non prise en charge : entrée compressée, chiffrée ou hors limites.')
    }
    const name = decoder.decode(directory.subarray(offset + 46, offset + 46 + nameLength))
    if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || name.endsWith('/')) {
      throw new Error('L’archive contient un chemin de fichier dangereux.')
    }
    if (entries.has(name)) throw new Error(`Entrée ZIP dupliquée : ${name}`)
    entries.set(name, { name, crc, size, localOffset })
    offset += recordLength
  }
  if (offset !== directory.length) throw new Error('Fin de répertoire ZIP invalide.')
  if (entries.size !== entryCount) throw new Error('Nombre d’entrées incohérent dans le répertoire ZIP.')
  return [...entries.values()]
}

async function extractEntry(handle, entry, root) {
  const local = await readAt(handle, entry.localOffset, 30)
  if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(8) !== 0 || local.readUInt16LE(6) & 1) {
    throw new Error(`En-tête invalide ou compression locale non prise en charge : ${entry.name}`)
  }
  const nameLength = local.readUInt16LE(26)
  const extraLength = local.readUInt16LE(28)
  const localName = new TextDecoder('utf-8', { fatal: true })
    .decode(await readAt(handle, entry.localOffset + 30, nameLength))
  if (localName !== entry.name) throw new Error(`Nom ZIP incohérent : ${entry.name}`)
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength
  const buffer = await readAt(handle, dataOffset, entry.size)
  if (crc32(buffer) !== entry.crc) throw new Error(`Contrôle CRC invalide : ${entry.name}`)
  const destination = path.join(root, ...entry.name.split('/'))
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, buffer, { flag: 'wx' })
  return destination
}

function isSafeR2Key(value, expectedPrefix) {
  return typeof value === 'string' && value.startsWith(expectedPrefix)
    && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..')
}

function validateManifest(manifest, files) {
  const errors = []
  if (!manifest || manifest.format !== FORMAT || manifest.version !== VERSION) {
    errors.push(`Format attendu après normalisation : ${FORMAT} v${VERSION}.`)
    return errors
  }
  const arrays = [
    'messages', 'senderRules', 'blockedSenders', 'senderRuleChanges', 'senderRuleChangeMessages',
    'senderRuleChangeMerges', 'drafts', 'threadMerges', 'threadMergeMembers',
  ]
  for (const name of arrays) if (!Array.isArray(manifest[name])) errors.push(`Tableau manifest.${name} manquant.`)
  if (errors.length) return errors
  for (const name of arrays) {
    if (manifest[name].some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      errors.push(`Chaque entrée de manifest.${name} doit être un objet.`)
    }
  }
  if (errors.length) return errors

  const ids = new Set()
  const messageIds = new Set()
  const messageByMessageId = new Map()
  const rawKeys = new Set()
  const expectedFiles = new Set(['README.txt', 'manifest.json'])
  for (const message of manifest.messages) {
    const identifierIsValid = message.is_outgoing
      ? /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(message.id || '')
      : /^[a-f0-9]{64}$/.test(message.id || '')
    if (!identifierIsValid) errors.push(`Identifiant de message invalide : ${message.id}`)
    if (ids.has(message.id)) errors.push(`Message en double : ${message.id}`)
    ids.add(message.id)
    if (typeof message.message_id !== 'string' || !message.message_id || messageIds.has(message.message_id)) errors.push(`Message-ID manquant ou dupliqué : ${message.id}`)
    messageIds.add(message.message_id)
    messageByMessageId.set(message.message_id, message)
    if (message.original !== `messages/${message.id}.eml` || !files.has(message.original)) {
      errors.push(`Original RFC 822 manquant ou mal référencé : ${message.id}`)
    }
    expectedFiles.add(message.original)
    const expectedRawKey = `messages/${message.id}/${message.is_outgoing ? 'sent-copy' : 'original'}.eml`
    if (!isSafeR2Key(message.raw_object_key, `messages/${message.id}/`)
      || message.raw_object_key !== expectedRawKey) {
      errors.push(`Clé R2 RFC 822 invalide : ${message.id}`)
    }
    if (!MAILBOX_FOLDERS.has(message.folder)) errors.push(`Boîte invalide pour ${message.id}.`)
    if (!['pending', 'cleared', 'blocked'].includes(message.screener_state)) errors.push(`État Screener invalide pour ${message.id}.`)
    for (const field of ['envelope_from', 'envelope_to', 'sender_name', 'sender_address', 'subject', 'received_at', 'mailbox_domain', 'screener_state']) {
      if (typeof message[field] !== 'string') errors.push(`Champ ${field} manquant pour ${message.id}.`)
    }
    for (const field of ['is_read', 'is_outgoing', 'is_set_aside', 'is_reply_later']) {
      if (typeof message[field] !== 'boolean') errors.push(`État ${field} invalide pour ${message.id}.`)
    }
    for (const field of ['sent_at', 'in_reply_to', 'references_header', 'trashed_at']) {
      if (message[field] !== null && typeof message[field] !== 'string') errors.push(`Champ ${field} invalide pour ${message.id}.`)
    }
    if (rawKeys.has(message.raw_object_key)) errors.push(`Clé R2 RFC 822 dupliquée : ${message.raw_object_key}`)
    rawKeys.add(message.raw_object_key)
    if (!Array.isArray(message.attachments)) errors.push(`Liste de pièces jointes manquante : ${message.id}`)
    for (const [index, attachment] of (message.attachments || []).entries()) {
      if (attachment.id !== `${message.id}-${index}` || attachment.message_id !== message.id
        || attachment.object_key !== `messages/${message.id}/attachments/${index}`
        || !isSafeR2Key(attachment.object_key, `messages/${message.id}/attachments/`)
        || typeof attachment.filename !== 'string' || typeof attachment.mime_type !== 'string'
        || !Number.isSafeInteger(attachment.size_bytes) || attachment.size_bytes < 0) {
        errors.push(`Pièce jointe mal référencée : ${attachment.id}`)
      }
      for (const field of ['content_id', 'disposition']) {
        if (attachment[field] !== null && typeof attachment[field] !== 'string') errors.push(`Métadonnée ${field} invalide : ${attachment.id}`)
      }
    }
  }
  for (const name of [...files.keys()]) {
    if (name !== 'README.txt' && name !== 'manifest.json' && !MESSAGE_FILE_PATTERN.test(name)) {
      errors.push(`Fichier non reconnu dans l’archive : ${name}`)
    }
    if (!expectedFiles.has(name)) errors.push(`Original sans entrée manifeste : ${name}`)
  }
  for (const required of ['README.txt', 'manifest.json']) {
    if (!files.has(required)) errors.push(`Fichier requis manquant : ${required}`)
  }
  const uniqueRows = (rows, key, label) => {
    const seen = new Set()
    for (const row of rows) {
      const value = key(row)
      if (seen.has(value)) errors.push(`Entrée dupliquée dans ${label} : ${value}`)
      seen.add(value)
    }
  }
  const requiredStrings = (rows, fields, label) => {
    for (const row of rows) for (const field of fields) {
      if (typeof row[field] !== 'string') errors.push(`Champ ${field} manquant dans ${label}.`)
    }
  }
  requiredStrings(manifest.senderRules, ['mailbox_domain', 'sender_address', 'folder', 'created_at', 'updated_at'], 'senderRules')
  requiredStrings(manifest.blockedSenders, ['mailbox_domain', 'sender_address', 'created_at'], 'blockedSenders')
  requiredStrings(manifest.senderRuleChanges, ['id', 'mailbox_domain', 'sender_address', 'next_folder', 'created_at', 'expires_at'], 'senderRuleChanges')
  requiredStrings(manifest.senderRuleChangeMessages, ['change_id', 'message_id', 'previous_folder'], 'senderRuleChangeMessages')
  requiredStrings(manifest.senderRuleChangeMerges, ['change_id', 'merge_id', 'previous_folder'], 'senderRuleChangeMerges')
  requiredStrings(manifest.drafts, ['id', 'reply_to_message_id', 'mailbox_domain', 'to_address', 'subject', 'text_body', 'status', 'created_at', 'updated_at'], 'drafts')
  requiredStrings(manifest.threadMerges, ['id', 'mailbox_domain', 'folder', 'created_at'], 'threadMerges')
  requiredStrings(manifest.threadMergeMembers, ['merge_id', 'root_message_id'], 'threadMergeMembers')
  uniqueRows(manifest.senderRules, row => `${row.mailbox_domain}\0${row.sender_address}`, 'senderRules')
  uniqueRows(manifest.blockedSenders, row => `${row.mailbox_domain}\0${row.sender_address}`, 'blockedSenders')
  uniqueRows(manifest.senderRuleChanges, row => row.id, 'senderRuleChanges')
  uniqueRows(manifest.drafts, row => row.id, 'drafts')
  uniqueRows(manifest.threadMerges, row => row.id, 'threadMerges')
  uniqueRows(manifest.senderRuleChangeMessages, row => `${row.change_id}\0${row.message_id}`, 'senderRuleChangeMessages')
  uniqueRows(manifest.senderRuleChangeMerges, row => `${row.change_id}\0${row.merge_id}`, 'senderRuleChangeMerges')
  uniqueRows(manifest.threadMergeMembers, row => `${row.merge_id}\0${row.root_message_id}`, 'threadMergeMembers')
  for (const change of manifest.senderRuleChanges) {
    if (!USER_FOLDERS.has(change.next_folder)
      || (change.previous_rule_folder !== null && !USER_FOLDERS.has(change.previous_rule_folder))) {
      errors.push(`Boîte invalide dans l’historique de règle : ${change.id}`)
    }
  }
  for (const item of manifest.senderRuleChangeMessages) {
    if (!MAILBOX_FOLDERS.has(item.previous_folder)) errors.push(`Boîte précédente invalide : ${item.change_id}`)
  }
  for (const item of manifest.senderRuleChangeMerges) {
    if (!USER_FOLDERS.has(item.previous_folder)) errors.push(`Boîte précédente invalide : ${item.change_id}`)
  }
  const changeIds = new Set(manifest.senderRuleChanges.map(change => change.id))
  const mergeIds = new Set(manifest.threadMerges.map(merge => merge.id))
  const mergesById = new Map(manifest.threadMerges.map(merge => [merge.id, merge]))
  for (const rule of manifest.senderRules) if (!USER_FOLDERS.has(rule.folder)) errors.push('Boîte invalide dans senderRules.')
  for (const merge of manifest.threadMerges) if (!USER_FOLDERS.has(merge.folder)) errors.push('Boîte invalide dans threadMerges.')
  for (const draft of manifest.drafts) {
    if (!ids.has(draft.reply_to_message_id)) errors.push(`Brouillon orphelin : ${draft.id}`)
    if (!['draft', 'sending'].includes(draft.status)) errors.push(`État de brouillon invalide : ${draft.id}`)
  }
  for (const member of manifest.threadMergeMembers) {
    if (!mergeIds.has(member.merge_id) || !messageIds.has(member.root_message_id)) {
      errors.push(`Membre de fusion orphelin : ${member.merge_id}`)
      continue
    }
    const merge = mergesById.get(member.merge_id)
    const message = messageByMessageId.get(member.root_message_id)
    if (merge && message && (merge.mailbox_domain !== message.mailbox_domain || merge.folder !== message.folder)) {
      errors.push(`Membre de fusion hors de sa boîte ou de son dossier : ${member.merge_id}`)
    }
  }
  for (const merge of manifest.threadMerges) {
    const members = manifest.threadMergeMembers.filter(member => member.merge_id === merge.id)
    if (members.length < 2) errors.push(`Fusion sans au moins deux fils : ${merge.id}`)
  }
  for (const member of manifest.senderRuleChangeMessages) {
    if (!changeIds.has(member.change_id) || !ids.has(member.message_id)) errors.push(`Historique de classement orphelin : ${member.change_id}`)
  }
  for (const merge of manifest.senderRuleChangeMerges) {
    if (!changeIds.has(merge.change_id) || !mergeIds.has(merge.merge_id)) errors.push(`Historique de fusion de règle orphelin : ${merge.change_id}`)
  }
  return errors
}

function normalizeManifest(manifest) {
  if (!manifest || manifest.format !== FORMAT || !SUPPORTED_VERSIONS.has(manifest.version)) {
    throw new Error(`Format attendu : ${FORMAT} v1 ou v${VERSION}.`)
  }
  const sourceVersion = manifest.version
  if (sourceVersion === VERSION) return { manifest, sourceVersion }

  const messages = manifest.messages
  if (!Array.isArray(messages)) throw new Error('Le manifeste v1 ne contient pas de tableau messages.')
  const normalizedMessages = messages.map((message) => {
    const attachments = Array.isArray(message.attachments) ? [...message.attachments] : []
    attachments.sort((left, right) => {
      const index = attachment => {
        const prefix = `${message.id}-`
        if (typeof attachment.id !== 'string' || !attachment.id.startsWith(prefix)) return Number.MAX_SAFE_INTEGER
        const value = attachment.id.slice(prefix.length)
        return /^\d+$/.test(value) ? Number(value) : Number.MAX_SAFE_INTEGER
      }
      return index(left) - index(right)
    })
    return {
      ...message,
      is_outgoing: message.is_outgoing ?? message.raw_object_key?.endsWith('/sent-copy.eml') ?? false,
      attachments: attachments.map((attachment, index) => ({
        ...attachment,
        object_key: attachment.object_key ?? `messages/${message.id}/attachments/${index}`,
      })),
    }
  })

  return {
    sourceVersion,
    manifest: {
      ...manifest,
      version: VERSION,
      messages: normalizedMessages,
      senderRuleChangeMerges: manifest.senderRuleChangeMerges ?? [],
      drafts: manifest.drafts ?? [],
      threadMerges: manifest.threadMerges ?? [],
      threadMergeMembers: manifest.threadMergeMembers ?? [],
    },
  }
}

export async function inspectArchive(archivePath) {
  const absolutePath = path.resolve(archivePath)
  const handle = await open(absolutePath, 'r')
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'courrier-restore-inspect-'))
  try {
    const stats = await handle.stat()
    if (stats.size < 22 || stats.size > MAX_ARCHIVE_BYTES) throw new Error('Taille d’archive hors limites.')
    const entries = await readCentralDirectory(handle, stats.size)
    const allowed = entries.filter(entry => entry.name === 'README.txt' || entry.name === 'manifest.json'
      || MESSAGE_FILE_PATTERN.test(entry.name))
    if (allowed.length !== entries.length || !entries.some(entry => entry.name === 'manifest.json')) {
      throw new Error('L’archive doit contenir uniquement le README, le manifeste et les originaux RFC 822.')
    }
    const files = new Map()
    for (const entry of allowed) files.set(entry.name, await extractEntry(handle, entry, temporaryDirectory))
    const rawManifest = JSON.parse(await readFile(files.get('manifest.json'), 'utf8'))
    const { manifest, sourceVersion } = normalizeManifest(rawManifest)
    const errors = validateManifest(manifest, files)
    if (errors.length) throw new Error(errors.join('\n'))

    const parsedMessages = []
    for (const message of manifest.messages) {
      const eml = await readFile(files.get(message.original))
      if (!message.is_outgoing) {
        const digest = createHash('sha256').update(eml).digest('hex')
        if (digest !== message.id) throw new Error(`Empreinte SHA-256 incorrecte pour ${message.id}.`)
      }
      const parsed = await PostalMime.parse(eml)
      const { attachments, text } = parsed
      if (attachments.length !== message.attachments.length) {
        throw new Error(`Nombre de pièces jointes incohérent pour ${message.id}.`)
      }
      for (const [index, attachment] of attachments.entries()) {
        const metadata = message.attachments[index]
        const bytes = attachmentBytes(attachment.content)
        if (bytes.byteLength !== metadata.size_bytes || attachment.mimeType !== metadata.mime_type
          || (attachment.filename || `piece-jointe-${index + 1}`) !== metadata.filename
          || (attachment.contentId || null) !== metadata.content_id
          || (attachment.disposition || null) !== metadata.disposition) {
          throw new Error(`Métadonnées MIME incohérentes pour la pièce jointe ${metadata.id}.`)
        }
        const filePath = path.join(temporaryDirectory, 'attachments', metadata.id)
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, bytes, { flag: 'wx' })
        metadata.__restore_file = filePath
      }
      // Keep only parsed message content; attachment buffers can be large and
      // have already been copied to disk for R2 restoration.
      parsedMessages.push({ message, parsed: { text }, filePath: files.get(message.original) })
    }
    return { manifest, files, parsedMessages, temporaryDirectory, absolutePath, sourceVersion, summary: summaryFor(manifest) }
  } catch (error) {
    await handle.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
    throw error
  } finally {
    if (handle.fd !== -1) await handle.close()
  }
}

function attachmentBytes(content) {
  if (typeof content === 'string') return Buffer.from(content)
  if (content instanceof ArrayBuffer) return Buffer.from(content)
  return Buffer.from(content)
}

function summaryFor(manifest) {
  return {
    version: manifest.version,
    messages: manifest.messages.length,
    attachments: manifest.messages.reduce((sum, message) => sum + message.attachments.length, 0),
    drafts: manifest.drafts.length,
    senderRules: manifest.senderRules.length,
    blockedSenders: manifest.blockedSenders.length,
    senderRuleChanges: manifest.senderRuleChanges.length,
    threadMerges: manifest.threadMerges.length,
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Valeur numérique SQL invalide.')
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function insertSql(table, columns, rows) {
  return rows.map((row) => {
    const values = columns.map(column => sqlValue(row[column]))
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`
  }).join('\n')
}

function buildRestoreSql(manifest, parsedMessages) {
  const messages = parsedMessages.map(({ message, parsed }) => ({ ...message, text_body: parsed.text || '' }))
  const attachmentRows = manifest.messages.flatMap(message => message.attachments)
  const statements = [
    insertSql('messages', ['id', 'message_id', 'envelope_from', 'envelope_to', 'sender_name', 'sender_address', 'subject', 'sent_at', 'received_at', 'in_reply_to', 'references_header', 'text_body', 'raw_object_key', 'mailbox_domain', 'folder', 'is_read', 'screener_state', 'is_set_aside', 'is_reply_later', 'trashed_at', 'is_outgoing'], messages),
    insertSql('attachments', ['id', 'message_id', 'filename', 'mime_type', 'size_bytes', 'object_key', 'content_id', 'disposition'], attachmentRows),
    insertSql('sender_rules', ['mailbox_domain', 'sender_address', 'folder', 'created_at', 'updated_at', 'last_change_id'], manifest.senderRules),
    insertSql('blocked_senders', ['mailbox_domain', 'sender_address', 'created_at'], manifest.blockedSenders),
    insertSql('sender_rule_changes', ['id', 'mailbox_domain', 'sender_address', 'previous_rule_folder', 'previous_change_id', 'next_folder', 'created_at', 'expires_at', 'undone_at'], manifest.senderRuleChanges),
    insertSql('sender_rule_change_messages', ['change_id', 'message_id', 'previous_folder'], manifest.senderRuleChangeMessages),
    insertSql('sender_rule_change_merges', ['change_id', 'merge_id', 'previous_folder'], manifest.senderRuleChangeMerges),
    insertSql('drafts', ['id', 'reply_to_message_id', 'mailbox_domain', 'to_address', 'subject', 'text_body', 'status', 'created_at', 'updated_at'], manifest.drafts),
    insertSql('thread_merges', ['id', 'mailbox_domain', 'folder', 'created_at'], manifest.threadMerges),
    insertSql('thread_merge_members', ['merge_id', 'root_message_id'], manifest.threadMergeMembers),
  ].filter(Boolean)
  return `${statements.join('\n')}\n`
}

function runWrangler(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--no-install', 'wrangler', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { errorOutput += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => {
      const combined = `${output}${errorOutput}`
      if (code !== 0) reject(new Error(combined || `Wrangler a quitté avec le code ${code}.`))
      else resolve(combined)
    })
  })
}

async function confirmRestore(database, bucket) {
  const phrase = `RESTORE ${database} ${bucket}`
  if (!process.stdin.isTTY) throw new Error(`Confirmation requise : relance la commande dans un terminal et saisis « ${phrase} ».`)
  const readline = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const response = await readline.question(`Les ressources Cloudflare suivantes vont être créées et remplies :\n  D1 ${database}\n  R2 ${bucket}\nAucune ressource existante ne sera remplacée.\nSaisis exactement « ${phrase} » pour continuer : `)
    if (response !== phrase) throw new Error('Confirmation incorrecte ; aucune restauration lancée.')
  } finally {
    readline.close()
  }
}

function databaseIdFrom(output) {
  const match = output.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)
  if (!match) throw new Error(`Wrangler n’a pas retourné l’identifiant D1 attendu :\n${output}`)
  return match[1]
}

function parseWranglerJson(output) {
  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error(`Wrangler n’a pas retourné de JSON exploitable :\n${output}`)
  return JSON.parse(output.slice(start, end + 1))
}

async function applyRestore(archivePath, database, bucket) {
  if (!/^courrier-restore-[a-z0-9-]{3,40}$/.test(database) || !/^courrier-restore-[a-z0-9-]{3,40}$/.test(bucket)) {
    throw new Error('Les deux noms doivent commencer par courrier-restore- et désigner des ressources de test neuves.')
  }
  const inspected = await inspectArchive(archivePath)
  const { manifest, parsedMessages, temporaryDirectory, files, summary, sourceVersion } = inspected
  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'courrier-restore-apply-'))
  const sqlPath = path.join(workingDirectory, 'restore.sql')
  let databaseCreated = false
  let bucketCreated = false
  try {
    await writeFile(sqlPath, buildRestoreSql(manifest, parsedMessages))
    await confirmRestore(database, bucket)
    const d1Output = await runWrangler(['d1', 'create', database, '--location', 'weur'], process.cwd())
    databaseCreated = true
    const databaseId = databaseIdFrom(d1Output)
    await runWrangler(['r2', 'bucket', 'create', bucket, '--location', 'weur'], process.cwd())
    bucketCreated = true

    const configPath = path.join(tmpdir(), `${database}.wrangler.jsonc`)
    const config = {
      name: database.replaceAll('_', '-'),
      main: path.resolve('.output/server/index.mjs'),
      compatibility_date: '2026-09-28',
      assets: { binding: 'ASSETS', directory: path.resolve('.output/public') },
      access: { dev: { aud: 'courrier-restore-local', identity: { email: 'restore@courrier.local', name: 'Courrier Restore' } } },
      vars: { CF_ACCESS_TEAM_DOMAIN: 'https://courrier-restore.cloudflareaccess.com', CF_ACCESS_AUD: 'courrier-restore-local' },
      d1_databases: [{ binding: 'DB', database_name: database, database_id: databaseId, migrations_dir: path.resolve('migrations'), remote: true }],
      r2_buckets: [{ binding: 'MAIL_STORE', bucket_name: bucket, remote: true }],
    }
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await runWrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath], process.cwd())

    for (const { message, filePath } of parsedMessages) {
      await runWrangler(['r2', 'object', 'put', `${bucket}/${message.raw_object_key}`, '--remote', '--force', '--file', filePath, '--content-type', 'message/rfc822'], process.cwd())
    }
    for (const message of manifest.messages) {
      for (const attachment of message.attachments) {
        await runWrangler(['r2', 'object', 'put', `${bucket}/${attachment.object_key}`, '--remote', '--force', '--file', attachment.__restore_file, '--content-type', attachment.mime_type], process.cwd())
      }
    }

    await runWrangler(['d1', 'execute', 'DB', '--remote', '--config', configPath, '--file', sqlPath], process.cwd())

    const counts = await runWrangler(['d1', 'execute', 'DB', '--remote', '--config', configPath, '--json', '--command', 'SELECT (SELECT COUNT(*) FROM messages) AS messages, (SELECT COUNT(*) FROM attachments) AS attachments, (SELECT COUNT(*) FROM sender_rules) AS sender_rules, (SELECT COUNT(*) FROM blocked_senders) AS blocked_senders, (SELECT COUNT(*) FROM sender_rule_changes) AS sender_rule_changes, (SELECT COUNT(*) FROM sender_rule_change_messages) AS sender_rule_change_messages, (SELECT COUNT(*) FROM sender_rule_change_merges) AS sender_rule_change_merges, (SELECT COUNT(*) FROM drafts) AS drafts, (SELECT COUNT(*) FROM thread_merges) AS thread_merges, (SELECT COUNT(*) FROM thread_merge_members) AS thread_merge_members'], process.cwd())
    const actualCounts = parseWranglerJson(counts)?.[0]?.results?.[0]
    const expectedCounts = {
      messages: manifest.messages.length,
      attachments: manifest.messages.reduce((total, message) => total + message.attachments.length, 0),
      sender_rules: manifest.senderRules.length,
      blocked_senders: manifest.blockedSenders.length,
      sender_rule_changes: manifest.senderRuleChanges.length,
      sender_rule_change_messages: manifest.senderRuleChangeMessages.length,
      sender_rule_change_merges: manifest.senderRuleChangeMerges.length,
      drafts: manifest.drafts.length,
      thread_merges: manifest.threadMerges.length,
      thread_merge_members: manifest.threadMergeMembers.length,
    }
    if (!actualCounts || Object.entries(expectedCounts).some(([table, expected]) => actualCounts[table] !== expected)) {
      throw new Error(`Les comptes D1 restaurés ne correspondent pas au manifeste. Attendu : ${JSON.stringify(expectedCounts)} ; reçu : ${JSON.stringify(actualCounts)}`)
    }
    console.log(`Restauration terminée depuis v${sourceVersion} : ${JSON.stringify(summary)}`)
    console.log(`Contrôle D1 : toutes les lignes restaurées correspondent au manifeste (${JSON.stringify(actualCounts)}).`)
    console.log(`Configuration temporaire de vérification locale : ${configPath}`)
    console.log(`Pour ouvrir Courrier avec ces données : npx wrangler dev --config "${configPath}" --ip 127.0.0.1 --port 3008`)
    console.log(`Ressources de test à supprimer après contrôle : D1 ${database}, R2 ${bucket}`)
  } catch (error) {
    console.error(`Restauration interrompue. Les ressources créées ne sont pas supprimées automatiquement.`)
    if (databaseCreated) console.error(`D1 ${database}`)
    if (bucketCreated) console.error(`R2 ${bucket}`)
    throw error
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
    await rm(workingDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const [command, archivePath, ...args] = process.argv.slice(2)
  if (command === 'inspect' && archivePath) {
    const inspected = await inspectArchive(archivePath)
    console.log(JSON.stringify({ archive: inspected.absolutePath, archiveVersion: inspected.sourceVersion, ...inspected.summary }, null, 2))
    await rm(inspected.temporaryDirectory, { recursive: true, force: true })
    return
  }
  if (command === 'restore' && archivePath) {
    const values = new Map()
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--database' || args[index] === '--bucket') values.set(args[index], args[++index])
    }
    const database = values.get('--database')
    const bucket = values.get('--bucket')
    if (!database || !bucket) throw new Error('Usage : restore-mailbox.mjs restore <archive.zip> --database courrier-restore-<nom> --bucket courrier-restore-<nom>')
    await applyRestore(archivePath, database, bucket)
    return
  }
  console.error('Usage :\n  node scripts/restore-mailbox.mjs inspect <archive.zip>\n  node scripts/restore-mailbox.mjs restore <archive.zip> --database courrier-restore-<nom> --bucket courrier-restore-<nom>')
  process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
