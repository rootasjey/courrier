import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const configPath = resolve('.output/server/wrangler.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))

if (config.main !== 'index.mjs') {
  throw new Error(`Expected Nitro's generated Worker entry to be index.mjs, received ${config.main}`)
}

config.main = relative(dirname(configPath), resolve('worker.ts'))
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
