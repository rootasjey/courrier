import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
      const parentDirectory = path.dirname(fileURLToPath(context.parentURL))
      const TypeScriptPath = path.resolve(parentDirectory, `${specifier}.ts`)
      if (existsSync(TypeScriptPath)) return nextResolve(pathToFileURL(TypeScriptPath).href, context)
    }
    return nextResolve(specifier, context)
  },
})
