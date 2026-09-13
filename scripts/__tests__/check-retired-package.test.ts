import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createPackage } from '@electron/asar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkRetiredPackage } from '../check-retired-package'

describe('packaged retired features', () => {
  let directory: string

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cherry-package-check-'))
  })

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  async function pack(files: Record<string, string> = {}) {
    const source = path.join(directory, 'source')
    const resources = path.join(directory, 'resources')
    await fs.mkdir(resources)
    for (const [name, content] of Object.entries({
      'out/main/main.js': 'const retained = true',
      'out/preload/preload.js': '',
      'out/renderer/windows/main/index.html': '<div id="root"></div>',
      ...files
    })) {
      const target = path.join(source, name)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content)
    }
    await createPackage(source, path.join(resources, 'app.asar'))
    return resources
  }

  it('allows generic icons and historical Agent and mini-app data types', async () => {
    const resources = await pack({
      'out/renderer/assets/claude-code.svg': '<svg/>',
      'out/main/history.js': 'const kinds = ["agent-session", "mini-app", "claude-code", "dsh"]'
    })

    expect(() => checkRetiredPackage(resources)).not.toThrow()
  })

  it.each(['claude-agent-sdk', 'claude-agent-sdk-win32-x64'])('rejects nested %s SDK content', async (sdk) => {
    const resources = await pack({
      [`node_modules/example/node_modules/@anthropic-ai/${sdk}/package.json`]: '{}'
    })

    expect(() => checkRetiredPackage(resources)).toThrow(`@anthropic-ai/${sdk}`)
  })

  it('rejects retired resources outside the archive', async () => {
    const resources = await pack()
    const retired = path.join(resources, 'app.asar.unpacked/resources/builtin-agents/cherry-assistant')
    await fs.mkdir(retired, { recursive: true })
    await fs.writeFile(path.join(retired, 'agent.json'), '{}')

    expect(() => checkRetiredPackage(resources)).toThrow('builtin-agents/cherry-assistant/agent.json')
  })

  it('rejects a runtime that was bundled into an otherwise generic chunk', async () => {
    const resources = await pack({ 'out/main/chunk.js': 'class DshRuntimeDriver {}' })

    expect(() => checkRetiredPackage(resources)).toThrow('out/main/chunk.js: DshRuntimeDriver')
  })

  it('rejects an archive that is missing the application entry point', async () => {
    const resources = await pack()
    await fs.rm(path.join(directory, 'source/out/main/main.js'))
    await createPackage(path.join(directory, 'source'), path.join(resources, 'empty.asar'))
    await fs.rename(path.join(resources, 'empty.asar'), path.join(resources, 'app.asar'))

    expect(() => checkRetiredPackage(resources)).toThrow('Missing application entry: out/main/main.js')
  })
})
