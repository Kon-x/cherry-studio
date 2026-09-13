import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { application } from '@application'
import { applyMigrations } from '@data/db/applyMigrations'
import { agentTable } from '@data/db/schemas/agent'
import { agentSessionTable } from '@data/db/schemas/agentSession'
import { agentSessionMessageTable } from '@data/db/schemas/agentSessionMessage'
import { agentWorkspaceTable } from '@data/db/schemas/agentWorkspace'
import { aiUsageRecordTable } from '@data/db/schemas/aiUsageRecord'
import { assistantTable } from '@data/db/schemas/assistant'
import { fileEntryTable } from '@data/db/schemas/file'
import {
  agentSessionMessageFileRefTable,
  miniAppFileRefTable,
  miniAppLogoFileRefTable
} from '@data/db/schemas/fileRelations'
import { miniAppTable } from '@data/db/schemas/miniApp'
import { seeders } from '@data/db/seeding/seederRegistry'
import { SeedRunner } from '@data/db/seeding/SeedRunner'
import { aiUsageRecordService } from '@data/services/AiUsageRecordService'
import { fileEntryService } from '@data/services/FileEntryService'
import { fileRefService } from '@data/services/FileRefService'
import { AiUsageRecordStatsQuerySchema } from '@shared/data/api/schemas/aiUsageRecords'
import type { FileEntryId } from '@shared/data/types/file'
import { setupTestDatabase } from '@test-helpers/db'
import { resolveMigrationsPath } from '@test-helpers/db/internal/migrationsPath'
import { MockMainDbServiceUtils } from '@test-mocks/main/DbService'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readAppliedChain } from '../appliedChain'
import { hashDbFile } from '../hashDbFile'
import { readRestoreJournal, writeRestoreJournal } from '../restoreJournal'
import { runRestorePromotion } from '../restorePromotion'
import { snapshotTo } from '../snapshot'

describe('retired feature data compatibility', () => {
  const dbh = setupTestDatabase()
  let userData: string
  const fileIds = [1, 2, 3, 4].map((n): FileEntryId => `019606a0-0000-7000-8000-${String(n).padStart(12, '0')}`)

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'cherry-retired-data-'))
    const paths: Record<string, string> = {
      'app.userdata': userData,
      'app.database.file': join(userData, 'Data/cherrystudio.sqlite'),
      'app.database.migrations': resolveMigrationsPath(),
      'feature.provider_registry.data': join(process.cwd(), 'packages/provider-registry/data'),
      'feature.backup.restore.file': join(userData, 'Data/restore-journal.json'),
      'feature.backup.restore.staging': join(userData, 'restore-staging')
    }
    vi.mocked(application.getPath).mockImplementation((key, filename) => {
      const base = paths[key] ?? join(userData, key)
      return filename ? join(base, filename) : base
    })
  })
  afterEach(() => {
    MockMainDbServiceUtils.setDb(dbh.db)
    rmSync(userData, { recursive: true, force: true })
  })

  it('seeds the default chat assistant without creating Agent or mini-app presets', () => {
    new SeedRunner(dbh.db).runAll(seeders)
    expect(dbh.db.select().from(assistantTable).all().length).toBeGreaterThan(0)
    expect(dbh.db.select().from(agentTable).all()).toEqual([])
    expect(dbh.db.select().from(miniAppTable).all()).toEqual([])
  })

  it('restores historical rows, attachment references and usage through the production promotion gate', async () => {
    const livePath = application.getPath('app.database.file')
    snapshotTo(dbh.sqlite, livePath)
    dbh.db
      .insert(agentTable)
      .values({ id: 'old-agent', type: 'claude-code', name: 'Archived Agent', instructions: '', orderKey: 'a0' })
      .run()
    dbh.db
      .insert(agentWorkspaceTable)
      .values({ id: 'workspace', name: 'Old workspace', path: '/kept/workspace', type: 'user', orderKey: 'a0' })
      .run()
    dbh.db
      .insert(agentSessionTable)
      .values({
        id: 'session',
        agentId: 'old-agent',
        name: 'Archived session',
        workspaceId: 'workspace',
        orderKey: 'a0'
      })
      .run()
    dbh.db
      .insert(agentSessionMessageTable)
      .values({
        id: 'message',
        sessionId: 'session',
        role: 'assistant',
        status: 'success',
        data: { parts: [{ type: 'text', text: 'Retained history' }] }
      })
      .run()
    dbh.db
      .insert(miniAppTable)
      .values({ appId: 'old-app', name: 'Archived app', url: 'app://old-app', kind: 'app', orderKey: 'a0' })
      .run()
    dbh.db
      .insert(fileEntryTable)
      .values(
        fileIds.map((id) => ({
          id,
          origin: 'internal',
          name: id,
          ext: 'txt',
          size: 7,
          cleanupPolicy: 'delete_when_unreferenced',
          createdAt: 1,
          updatedAt: 1
        }))
      )
      .run()
    dbh.db
      .insert(agentSessionMessageFileRefTable)
      .values({ fileEntryId: fileIds[0], sourceId: 'message', role: 'attachment' })
      .run()
    dbh.db.insert(miniAppLogoFileRefTable).values({ fileEntryId: fileIds[1], sourceId: 'old-app' }).run()
    dbh.db
      .insert(miniAppFileRefTable)
      .values({ fileEntryId: fileIds[2], sourceId: 'old-app', logicalName: 'document' })
      .run()
    dbh.db
      .insert(aiUsageRecordTable)
      .values({
        requestId: 'old-request',
        recordKind: 'invocation',
        requestCount: 1,
        messageKind: 'agent-session',
        messageId: 'message',
        providerId: 'claude-code',
        modelId: 'claude-model',
        sourceType: 'agent',
        sourceId: 'old-agent',
        sourceName: 'Archived Agent',
        modality: 'language',
        apiKeyAttribution: 'unknown',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        createdAt: 1000
      })
      .run()

    const staging = join(userData, 'restore-staging/history')
    const workPath = join(staging, 'work.sqlite')
    snapshotTo(dbh.sqlite, workPath)
    mkdirSync(join(staging, 'Files'), { recursive: true })
    for (const id of fileIds) writeFileSync(join(staging, 'Files', `${id}.txt`), 'payload')
    writeRestoreJournal({
      version: 1,
      restoreId: 'history',
      createdAt: new Date().toISOString(),
      state: 'staged',
      db: {
        promote: 'restore-staging/history/work.sqlite',
        aside: 'restore-staging/history/aside.sqlite',
        fingerprint: await hashDbFile(livePath),
        chain: readAppliedChain(dbh.sqlite)
      },
      fileResources: [{ kind: 'dir-add', stagingPath: 'restore-staging/history/Files', livePath: 'Data/Files' }]
    })
    await runRestorePromotion()
    expect(readRestoreJournal()).toMatchObject({ kind: 'ok', journal: { state: 'completed' } })

    const restoredSqlite = new Database(livePath)
    try {
      const restored = drizzle({ client: restoredSqlite, casing: 'snake_case' })
      applyMigrations(restored, resolveMigrationsPath())
      MockMainDbServiceUtils.setDb(restored)
      expect(restored.select().from(agentSessionMessageTable).all()[0].data.parts).toEqual([
        { type: 'text', text: 'Retained history' }
      ])
      expect(restored.select().from(agentWorkspaceTable).all()[0].path).toBe('/kept/workspace')
      expect(fileRefService.countByEntryIds(fileIds)).toEqual(
        new Map([
          [fileIds[0], 1],
          [fileIds[1], 1],
          [fileIds[2], 1]
        ])
      )
      expect(fileEntryService.findCleanupCandidates({ graceMs: 0, limit: 10 }).map(({ id }) => id)).toEqual([
        fileIds[3]
      ])
      expect(
        aiUsageRecordService.list({ limit: 10, messageKind: 'agent-session', messageId: 'message' }).items
      ).toMatchObject([{ sourceName: 'Archived Agent', totalTokens: 150 }])
      expect(
        aiUsageRecordService.stats(AiUsageRecordStatsQuerySchema.parse({ groupBy: 'source', from: 0, to: 2000 })).totals
      ).toMatchObject({ requestCount: 1, totalTokens: 150 })
      for (const id of fileIds.slice(0, 3))
        expect(readFileSync(join(userData, 'Data/Files', `${id}.txt`), 'utf8')).toBe('payload')
    } finally {
      MockMainDbServiceUtils.setDb(dbh.db)
      restoredSqlite.close()
    }
  })
})
