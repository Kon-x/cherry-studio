import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import type { JSONReport, JSONReportSuite } from '@playwright/test/reporter'

import { getCase, missingCapabilities, PHASE_IDS, selectCases, supportsPlatform } from '../cases'

describe('regression execution plan', () => {
  it('selects only the requested retained task within its phase', () => {
    expect(selectCases('translation-settings', 'translation').map(({ id }) => id)).toEqual(['MP-86'])
    expect(selectCases('knowledge-smoke', 'knowledge').map(({ id }) => id)).toEqual(['K-01'])
    expect(selectCases('notes', 'modelsAndAssistants')).toEqual([])
    expect(selectCases('notes', 'basicFeatures').map(({ id }) => id)).toEqual(['N-01'])
    expect(() => getCase('missing')).toThrow('Unknown regression case')
  })

  it.each([
    ['notes', ['N-01', 'MP-11', 'MP-74', 'MP-75', 'MP-76', 'MP-77', 'MP-78', 'MP-79']],
    ['knowledge', ['K-01', 'MP-59', 'MP-60', 'MP-61', 'MP-62', 'MP-63', 'MP-64', 'MP-65', 'MP-66', 'MP-67']],
    ['paintings', ['P-01', 'MP-90', 'MP-91', 'MP-92']],
    ['translation', ['T-01', 'T-02', 'MP-81', 'MP-82', 'MP-83', 'MP-85', 'MP-86']]
  ] as const)('includes the retained module scenarios in %s', (task, ids) => {
    expect(selectCases(task).map(({ id }) => id)).toEqual(ids)
  })

  it.each([
    ['notes-smoke', ['N-01']],
    ['knowledge-smoke', ['K-01']],
    ['chat-error-recovery', ['MP-17']]
  ] as const)('keeps the focused task %s limited to its intended scenarios', (task, ids) => {
    expect(selectCases(task).map(({ id }) => id)).toEqual(ids)
  })

  it('keeps every retained manifest phase executable', () => {
    expect(readdirSync(resolve('tests/e2e/regression/phases')).sort()).toEqual(
      PHASE_IDS.map((phase) => `${phase}.test.ts`).sort()
    )
  })

  it('blocks native interactions when desktop automation is missing without blocking pure UI tasks', () => {
    expect(missingCapabilities('C-02', { desktopAutomation: { available: false } })).toEqual(['desktopAutomation'])
    expect(missingCapabilities('C-02', {})).toEqual(['desktopAutomation'])
    expect(missingCapabilities('C-02', { desktopAutomation: { available: true } })).toEqual([])
    expect(missingCapabilities('N-01', {})).toEqual([])
    expect(
      missingCapabilities('MP-09', {
        desktopAutomation: { available: true },
        screenCapture: { available: false }
      })
    ).toEqual(['screenCapture'])
  })

  it('keeps macOS-only scenarios out of Windows runs and leaves cross-platform cases applicable', () => {
    for (const id of [
      'MP-68',
      'MP-72',
      'MP-77',
      'MP-105',
      'MP-110',
      'MP-111',
      'MP-121',
      'MP-127',
      'MP-132',
      'MP-133'
    ] as const) {
      expect(supportsPlatform(id, 'macos'), id).toBe(true)
      expect(supportsPlatform(id, 'windows'), id).toBe(false)
    }
    for (const id of ['MP-70', 'MP-82', 'MP-90', 'MP-109', 'S-01'] as const) {
      expect(supportsPlatform(id, 'windows'), id).toBe(true)
    }
  })
})

it.each(['all', 'notes', 'notes-smoke', 'knowledge', 'mcp', 'tool-settings'] as const)(
  'discovers the selected %s cases through Playwright without matching another task prefix',
  (task) => {
    const directory = mkdtempSync(join(tmpdir(), 'cherry-regression-enumeration-'))
    try {
      const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
      const args = [cli, 'test', '--config', 'playwright.regression.config.ts', '--list', '--reporter=json']
      if (task !== 'all') args.push('--grep', `@${task}(?:\\s|$)`)
      const report = JSON.parse(
        execFileSync(process.execPath, args, {
          encoding: 'utf8',
          timeout: 20_000,
          env: { ...process.env, CHERRY_TEST_RUN_DIR: directory }
        })
      ) as JSONReport
      const collect = (suites: JSONReportSuite[]): Array<{ id: string | undefined; tasks: string[]; phase: string }> =>
        suites.flatMap((suite) => [
          ...suite.specs.flatMap((spec) =>
            spec.tests.map((test) => ({
              id: test.annotations.find(({ type }) => type === 'regression-case')?.description,
              tasks: spec.tags,
              phase: basename(spec.file, '.test.ts')
            }))
          ),
          ...collect(suite.suites ?? [])
        ])
      expect(report.errors).toEqual([])
      const discovered = collect(report.suites)
      const selected = selectCases(task).map(({ id, tasks, phase }) => ({ id, tasks, phase }))
      expect(discovered).toHaveLength(selected.length)
      for (const phase of PHASE_IDS) {
        expect(discovered.filter((test) => test.phase === phase)).toEqual(
          selected.filter((test) => test.phase === phase)
        )
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
