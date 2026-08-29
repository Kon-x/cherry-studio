import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parse } from 'yaml'

const [artifactsArgument, expectedVersion] = process.argv.slice(2)
if (!artifactsArgument || !expectedVersion) {
  throw new Error('Usage: tsx scripts/validate-windows-release.ts <artifacts-directory> <version>')
}

const artifactsDirectory = path.resolve(artifactsArgument)
const artifactNames = fs.readdirSync(artifactsDirectory)
const expectedSetup = `Cherry-Studio-${expectedVersion}-win-x64-setup.exe`
const expectedPortable = `Cherry-Studio-${expectedVersion}-win-x64-portable.exe`

function requireOnlyOne(pattern: RegExp, expectedName: string): void {
  const matches = artifactNames.filter((name) => pattern.test(name))
  if (matches.length !== 1 || matches[0] !== expectedName) {
    throw new Error(`Expected exactly one ${expectedName}; found ${matches.join(', ') || 'none'}`)
  }
}

requireOnlyOne(/-x64-setup\.exe$/, expectedSetup)
requireOnlyOne(/-x64-portable\.exe$/, expectedPortable)
requireOnlyOne(/^latest\.yml$/, 'latest.yml')

if (!artifactNames.includes('release-history.json')) {
  throw new Error('release-history.json is missing')
}

const updateManifest = parse(fs.readFileSync(path.join(artifactsDirectory, 'latest.yml'), 'utf8')) as {
  files?: Array<{ sha512?: unknown; url?: unknown }>
  path?: unknown
  sha512?: unknown
  version?: unknown
}
if (updateManifest.version !== expectedVersion) {
  throw new Error(`latest.yml version must be ${expectedVersion}`)
}
if (updateManifest.path !== expectedSetup) {
  throw new Error(`latest.yml path must be ${expectedSetup}`)
}

const setupSha512 = crypto
  .createHash('sha512')
  .update(fs.readFileSync(path.join(artifactsDirectory, expectedSetup)))
  .digest('base64')
if (updateManifest.sha512 !== setupSha512) {
  throw new Error('latest.yml top-level SHA512 does not match the setup installer')
}

const setupFile = updateManifest.files?.find(({ url }) => url === expectedSetup)
if (!setupFile || setupFile.sha512 !== setupSha512) {
  throw new Error('latest.yml files entry does not match the setup installer')
}

process.stdout.write(`Validated Windows x64 release artifacts for ${expectedVersion}.\n`)
