import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'

const { syncReleaseHistory } = createRequire(import.meta.url)('../sync-release-history.js')

describe('release history generation', () => {
  let directory: string
  let builderPath: string
  let historyPath: string
  const previous = { version: '2.0.13', releaseNotes: 'Previously published notes\n' }
  const releaseNotes = '<!--LANG:en-->\nUpdated release\n<!--LANG:zh-CN-->\n更新说明\n<!--LANG:END-->\n'

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-release-history-'))
    builderPath = path.join(directory, 'electron-builder.yml')
    historyPath = path.join(directory, 'release-history.json')
    fs.writeFileSync(builderPath, stringify({ releaseInfo: { releaseNotes } }))
    fs.writeFileSync(historyPath, `${JSON.stringify([previous], null, 2)}\n`)
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it.each(['2.0.14', '2.0.14-kx.2'])('records published version %s with the exact bilingual notes', (version) => {
    syncReleaseHistory({ builderPath, historyPath, version })

    expect(JSON.parse(fs.readFileSync(historyPath, 'utf8'))).toEqual([{ version, releaseNotes }, previous])
  })

  it('replaces the current release entry without duplicating it or changing older notes', () => {
    fs.writeFileSync(historyPath, JSON.stringify([{ version: '2.0.14-kx.2', releaseNotes: 'Outdated' }, previous]))

    syncReleaseHistory({ builderPath, historyPath, version: '2.0.14-kx.2' })

    expect(JSON.parse(fs.readFileSync(historyPath, 'utf8'))).toEqual([
      { version: '2.0.14-kx.2', releaseNotes },
      previous
    ])
  })

  it.each(['2.0.15-beta.1', '2.0.15-rc.1'])('leaves stable history untouched for %s', (version) => {
    const before = fs.readFileSync(historyPath)
    fs.unlinkSync(builderPath)

    expect(syncReleaseHistory({ builderPath, historyPath, version })).toBeNull()
    expect(fs.readFileSync(historyPath)).toEqual(before)
  })

  it.each(['v2.0.14', '2.0.14+build.1', 'invalid'])('rejects invalid release metadata version %s', (version) => {
    const before = fs.readFileSync(historyPath)

    expect(() => syncReleaseHistory({ builderPath, historyPath, version })).toThrow('Invalid release version')
    expect(fs.readFileSync(historyPath)).toEqual(before)
  })

  it('keeps the existing history when release notes are missing', () => {
    const before = fs.readFileSync(historyPath)
    fs.writeFileSync(builderPath, 'releaseInfo: {}\n')

    expect(() => syncReleaseHistory({ builderPath, historyPath, version: '2.0.14-kx.2' })).toThrow(
      'non-empty releaseInfo.releaseNotes'
    )
    expect(fs.readFileSync(historyPath)).toEqual(before)
  })
})
