import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const reviewThreshold = 500
const highThreshold = 800
const sourceExtensions = new Set(['.cjs', '.css', '.js', '.mjs', '.scss', '.sql', '.ts', '.vue'])
const ignoredDirectories = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.wrangler',
  '__fixtures__',
  'coverage',
  'dist',
  'fixtures',
  'node_modules',
  'vendor',
])

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)

const oversizedFiles = []

for (const file of files) {
  const normalizedFile = file.split(path.sep).join('/')
  const segments = normalizedFile.split('/')
  const basename = segments.at(-1)

  if (!sourceExtensions.has(path.extname(normalizedFile).toLowerCase())) continue
  if (basename === 'worker-configuration.d.ts') continue
  if (segments.some(segment => ignoredDirectories.has(segment) || segment === '__generated__' || segment === 'generated')) continue

  let contents
  try {
    if (!statSync(file).isFile()) continue
    contents = readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') continue
    throw error
  }

  const lineCount = contents.length === 0
    ? 0
    : contents.split('\n').length - (contents.endsWith('\n') ? 1 : 0)

  if (lineCount > reviewThreshold) oversizedFiles.push({ file: normalizedFile, lineCount })
}

oversizedFiles.sort((a, b) => b.lineCount - a.lineCount || a.file.localeCompare(b.file))

if (oversizedFiles.length === 0) {
  console.log(`File-size check: no source files exceed ${reviewThreshold} lines.`)
} else {
  console.log(`File-size check: ${oversizedFiles.length} source file(s) exceed ${reviewThreshold} lines (report only; no failure).`)

  for (const { file, lineCount } of oversizedFiles) {
    const level = lineCount > highThreshold ? 'HIGH' : 'REVIEW'
    console.log(`  ${level.padEnd(6)} ${String(lineCount).padStart(5)} lines  ${file}`)
  }
}
