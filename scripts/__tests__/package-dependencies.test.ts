import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder'))
const { PnpmNodeModulesCollector } = builderRequire(
  'app-builder-lib/out/node-module-collector/pnpmNodeModulesCollector'
)
const { TmpDir } = builderRequire('temp-file')
const { satisfies } = builderRequire('semver')

type CollectedModule = { name: string; version: string; dir: string; dependencies?: CollectedModule[] }

async function collectProductionModules(): Promise<CollectedModule[]> {
  const temporaryDirectory = new TmpDir()
  try {
    const { nodeModules } = await new PnpmNodeModulesCollector(projectRoot, temporaryDirectory).getNodeModules({
      packageName: 'CherryStudio'
    })
    const modules: CollectedModule[] = []
    const visit = (nodes: CollectedModule[]) => {
      for (const node of nodes) {
        modules.push(node)
        visit(node.dependencies ?? [])
      }
    }
    visit(nodeModules)
    return modules
  } finally {
    await temporaryDirectory.cleanup()
  }
}

describe('packaged Smithy dependencies', () => {
  it('preserves S3 request signing and response decoding for backups', async () => {
    const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3')
    let authorization = ''
    const client = new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
      requestHandler: {
        handle: async (request: { headers: Record<string, string> }) => {
          authorization = request.headers.authorization
          return {
            response: {
              statusCode: 200,
              headers: { 'content-type': 'application/xml' },
              body: new TextEncoder().encode(
                '<ListAllMyBucketsResult><Buckets><Bucket><Name>backups</Name></Bucket></Buckets></ListAllMyBucketsResult>'
              )
            }
          }
        }
      }
    })
    try {
      const response = await client.send(new ListBucketsCommand({}))
      expect(response.Buckets).toEqual([{ Name: 'backups' }])
      expect(authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-key\//)
    } finally {
      client.destroy()
    }
  })
})

describe('packaged production dependency closure', () => {
  // Moving a package to devDependencies can drop the only production source of another package's
  // peer; dev and tests still resolve it from the workspace, so only the packaged app fails to load.
  it('ships every required peer of every packaged module', async () => {
    const modules = await collectProductionModules()
    const versions = new Map<string, string[]>()
    for (const node of modules) versions.set(node.name, [...(versions.get(node.name) ?? []), node.version])
    const unmet: string[] = []
    let checked = 0
    for (const node of modules) {
      const manifest = JSON.parse(readFileSync(path.join(node.dir, 'package.json'), 'utf8'))
      for (const [peer, range] of Object.entries<string>(manifest.peerDependencies ?? {})) {
        if (manifest.peerDependenciesMeta?.[peer]?.optional) continue
        checked++
        const shipped = versions.get(peer) ?? []
        if (!shipped.some((version) => satisfies(version, range))) {
          unmet.push(`${node.name} -> ${peer}@${range} (shipped: ${shipped.join(', ') || 'none'})`)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(unmet).toEqual([])
  }, 60_000)
})
