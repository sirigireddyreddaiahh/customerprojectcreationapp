import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripQuotes(value) {
  if (!value) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}

export function loadEnvFromFile(filePath = '.env') {
  const absolute = resolve(process.cwd(), filePath)
  if (!existsSync(absolute)) return

  const content = readFileSync(absolute, 'utf8')
  const lines = content.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()

    if (!key || process.env[key] !== undefined) continue
    process.env[key] = stripQuotes(rawValue)
  }
}
