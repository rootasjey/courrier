import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const configPath = resolve('.output/server/wrangler.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const isCiBuild = Boolean(process.env.WORKERS_CI || process.env.CI)
const localVars = isCiBuild
  ? ''
  : await readFile('.dev.vars', 'utf8').catch(() => '')
const localRecipientsLine = localVars.split(/\r?\n/).find(line => line.trim().startsWith('COURRIER_ALLOWED_RECIPIENTS='))
const localRecipients = localRecipientsLine?.slice(localRecipientsLine.indexOf('=') + 1).trim().replace(/^("|')(.*)\1$/, '$2')
const configuredRecipients = process.env.COURRIER_ALLOWED_RECIPIENTS ?? localRecipients

if (isCiBuild && !process.env.COURRIER_ALLOWED_RECIPIENTS) {
  throw new Error('COURRIER_ALLOWED_RECIPIENTS must be configured as a CI build secret.')
}

if (configuredRecipients !== undefined) {
  const recipients = [...new Set(configuredRecipients.split(',').map(address => address.trim().toLocaleLowerCase('en-US')).filter(Boolean))]
  if (!recipients.length || recipients.some(address => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(address))) {
    throw new Error('COURRIER_ALLOWED_RECIPIENTS must contain a comma-separated list of valid email addresses.')
  }

  const emailBinding = config.send_email?.find(binding => binding.name === 'EMAIL')
  if (!emailBinding) throw new Error('The EMAIL send_email binding is missing from the generated Wrangler configuration.')
  emailBinding.allowed_destination_addresses = recipients
} else {
  for (const emailBinding of config.send_email || []) {
    delete emailBinding.allowed_destination_addresses
  }
}

if (config.main !== 'index.mjs') {
  throw new Error(`Expected Nitro's generated Worker entry to be index.mjs, received ${config.main}`)
}

config.main = relative(dirname(configPath), resolve('worker.ts'))
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
