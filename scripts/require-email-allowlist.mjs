import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile('.output/server/wrangler.json', 'utf8'))
const emailBinding = config.send_email?.find(binding => binding.name === 'EMAIL')
const recipients = emailBinding?.allowed_destination_addresses

if (!Array.isArray(recipients) || recipients.length === 0 || recipients.some(address => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(address))) {
  throw new Error('Refusing remote deployment: the generated EMAIL binding has no valid destination allowlist. Configure COURRIER_ALLOWED_RECIPIENTS in .dev.vars or the Workers Builds secret.')
}

console.log(`Remote email allowlist verified (${recipients.length} destination${recipients.length === 1 ? '' : 's'}).`)
