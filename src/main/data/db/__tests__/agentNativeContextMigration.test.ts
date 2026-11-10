import { resolve } from 'node:path'

import { setupTestDatabase } from '@test-helpers/db'
import { v7 as uuid } from 'uuid'
import { describe, expect, it } from 'vitest'

import { applyMigrations } from '@data/db/applyMigrations'
import { aiUsageRecordTable } from '@data/db/schemas/aiUsageRecord'
import { jobScheduleTable, jobTable } from '@data/db/schemas/job'
import { miniAppTable } from '@data/db/schemas/miniApp'

function archive(dbh: ReturnType<typeof setupTestDatabase>) {
  const workspaceId = uuid()
  const sessionId = uuid()
  const messageId = uuid()
  dbh.sqlite
    .prepare(
      'INSERT INTO agent_workspace (id, name, path, type, order_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)'
    )
    .run(workspaceId, 'Existing', '/existing', 'user', 'a0')
  dbh.sqlite
    .prepare(
      'INSERT INTO agent_session (id, workspace_id, name, order_key, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
    )
    .run(sessionId, workspaceId, 'Existing', 'a0')
  dbh.sqlite
    .prepare(`INSERT INTO agent_session_message
    (id, session_id, role, data, status, runtime_resume_token, delivery_status, searchable_text, created_at, updated_at)
    VALUES (?, ?, 'user', ?, 'success', 'old-native-token', 'accepted', 'preserved searchable archive', 1, 1)`)
    .run(messageId, sessionId, JSON.stringify({ parts: [{ type: 'text', text: 'preserved searchable archive' }] }))
  const fileId = uuid()
  dbh.sqlite
    .prepare(
      "INSERT INTO file_entry (id, origin, name, external_path, created_at, updated_at) VALUES (?, 'external', ?, ?, 1, 1)"
    )
    .run(fileId, 'attachment', '/existing/attachment.txt')
  dbh.sqlite
    .prepare(
      "INSERT INTO agent_session_message_file_ref (id, file_entry_id, source_id, role, created_at, updated_at) VALUES (?, ?, ?, 'attachment', 1, 1)"
    )
    .run(uuid(), fileId, messageId)
  return { messageId, sessionId, workspaceId }
}

function assertArchive(
  dbh: ReturnType<typeof setupTestDatabase>,
  messageId: string,
  before: unknown,
  attachment: unknown
) {
  const row = dbh.sqlite.prepare('SELECT * FROM agent_session_message WHERE id = ?').get(messageId) as Record<
    string,
    unknown
  >
  expect(row).toMatchObject(before as Record<string, unknown>)
  expect(dbh.sqlite.prepare('SELECT * FROM agent_session_message_file_ref').get()).toEqual(attachment)
  expect(
    dbh.sqlite
      .prepare("SELECT count(*) AS n FROM agent_session_message_fts WHERE agent_session_message_fts MATCH 'searchable'")
      .get()
  ).toEqual({ n: 1 })
  expect(dbh.sqlite.pragma('foreign_key_check')).toEqual([])
}

describe('native context migrate-forward', () => {
  const dbh = setupTestDatabase({ beforeMigration: '0030_skill_mirror_export' })

  it('preserves the 2.1.10 archive and dormant schedules through 0035 and repeated startup', () => {
    const { messageId, sessionId, workspaceId } = archive(dbh)
    dbh.db
      .insert(jobScheduleTable)
      .values([
        {
          id: 'reuse-task',
          type: 'agent.task',
          name: 'Retained recurring task',
          trigger: { kind: 'interval', ms: 60000 },
          jobInputTemplate: { prompt: 'Keep old prompt' },
          catchUpPolicy: { kind: 'skip-missed' },
          enabled: true
        },
        {
          id: 'history-task',
          type: 'agent.task',
          name: 'Retained completed task',
          trigger: { kind: 'interval', ms: 60000 },
          jobInputTemplate: {},
          catchUpPolicy: { kind: 'skip-missed' },
          enabled: false
        }
      ])
      .run()
    dbh.sqlite.prepare('UPDATE agent_session SET task_schedule_id = ? WHERE id = ?').run('reuse-task', sessionId)
    for (const id of ['history-session', 'ordinary-session']) {
      dbh.sqlite
        .prepare(
          'INSERT INTO agent_session (id, workspace_id, name, order_key, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
        )
        .run(id, workspaceId, id, id)
    }
    dbh.db
      .insert(jobTable)
      .values({
        id: 'old-job',
        type: 'agent.task',
        status: 'completed',
        queue: 'agent:old',
        scheduleId: 'history-task',
        scheduledAt: 1,
        finishedAt: 2,
        input: { prompt: 'Original input' },
        output: { result: 'Original output' },
        metadata: { sessionId: 'history-session' }
      })
      .run()
    dbh.db
      .insert(miniAppTable)
      .values({ appId: 'old-mini-app', name: 'Archived app', url: 'app://old-mini-app', kind: 'app', orderKey: 'a0' })
      .run()
    dbh.db
      .insert(aiUsageRecordTable)
      .values({
        requestId: 'old-request',
        recordKind: 'invocation',
        requestCount: 1,
        messageKind: 'agent-session',
        messageId,
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
    const schedules = dbh.db.select().from(jobScheduleTable).all()
    const jobs = dbh.db.select().from(jobTable).all()
    const miniApps = dbh.db.select().from(miniAppTable).all()
    const usage = dbh.db.select().from(aiUsageRecordTable).all()
    const { task_schedule_id: previousTaskId, ...session } = dbh.sqlite
      .prepare('SELECT * FROM agent_session WHERE id = ?')
      .get(sessionId) as Record<string, unknown>
    const before = dbh.sqlite.prepare('SELECT * FROM agent_session_message WHERE id = ?').get(messageId)
    const attachment = dbh.sqlite.prepare('SELECT * FROM agent_session_message_file_ref').get()
    applyMigrations(dbh.db, resolve('migrations/sqlite-drizzle'))
    applyMigrations(dbh.db, resolve('migrations/sqlite-drizzle'))
    assertArchive(dbh, messageId, before, attachment)
    expect(dbh.sqlite.prepare('SELECT parent_id FROM agent_session_message WHERE id = ?').get(messageId)).toEqual({
      parent_id: null
    })
    expect(
      dbh.sqlite
        .prepare('SELECT input_context_id, native_input_id FROM agent_session_message WHERE id = ?')
        .get(messageId)
    ).toEqual({ input_context_id: null, native_input_id: null })
    expect(dbh.sqlite.prepare('SELECT count(*) AS n FROM agent_session_context').get()).toEqual({ n: 0 })
    expect(dbh.sqlite.prepare('SELECT * FROM agent_session WHERE id = ?').get(sessionId)).toMatchObject({
      ...session,
      task_id: previousTaskId,
      is_task_reuse_target: 1
    })
    expect(
      dbh.sqlite.prepare('SELECT task_id, is_task_reuse_target FROM agent_session WHERE id = ?').get('history-session')
    ).toEqual({ task_id: 'history-task', is_task_reuse_target: 0 })
    expect(
      dbh.sqlite.prepare('SELECT task_id, is_task_reuse_target FROM agent_session WHERE id = ?').get('ordinary-session')
    ).toEqual({ task_id: null, is_task_reuse_target: 0 })
    expect(dbh.db.select().from(jobScheduleTable).all()).toEqual(schedules)
    expect(dbh.db.select().from(jobTable).all()).toEqual(jobs)
    expect(dbh.db.select().from(miniAppTable).all()).toEqual(miniApps)
    expect(dbh.db.select().from(aiUsageRecordTable).all()).toEqual(usage)
    expect(dbh.sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(dbh.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(
      (dbh.sqlite.pragma('table_info(agent_session_message)') as { name: string }[]).map((column) => column.name)
    ).not.toContain('submission')
  })
})
