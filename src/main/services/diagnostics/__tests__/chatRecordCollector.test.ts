import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { messageTable } from '@data/db/schemas/message'
import { topicTable } from '@data/db/schemas/topic'
import { AbsoluteFilePathSchema } from '@shared/types/file'
import { setupTestDatabase, withRoot } from '@test-helpers/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { collectChatRecords, stageChatRecords } from '../chatRecordCollector'

describe('chat record collection', () => {
  const dbh = setupTestDatabase()
  let tempRoot: ReturnType<typeof AbsoluteFilePathSchema.parse>

  beforeEach(async () => {
    tempRoot = AbsoluteFilePathSchema.parse(await mkdtemp(path.join(tmpdir(), 'diagnostic-chat-records-')))
    dbh.db.insert(topicTable).values({ id: 'topic', name: 'Topic', orderKey: 'a0' }).run()
    dbh.db
      .insert(messageTable)
      .values(
        withRoot('topic', [
          {
            id: 'message-new',
            topicId: 'topic',
            parentId: null,
            role: 'user',
            status: 'success',
            data: { parts: [{ type: 'text', text: '你好🙂' }] },
            createdAt: 2000,
            updatedAt: 2000
          },
          {
            id: 'message-old',
            topicId: 'topic',
            parentId: null,
            role: 'assistant',
            status: 'success',
            data: { parts: [{ type: 'text', text: 'reply' }] },
            createdAt: 1000,
            updatedAt: 1000
          }
        ])
      )
      .run()
  })
  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('stages canonical ordinary messages as UTF-8 JSONL with one shared topic record', async () => {
    const candidates = await Array.fromAsync(collectChatRecords({ fromMs: 0, toMs: 3000 }).candidates)
    const result = await stageChatRecords(candidates.toReversed(), tempRoot, 1024 * 1024)
    const messageBytes = await readFile(path.join(tempRoot, 'chats/messages.jsonl'))
    const topicBytes = await readFile(path.join(tempRoot, 'chats/topics.jsonl'))
    const messages = messageBytes
      .toString('utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(messages.map(({ id }) => id)).toEqual(['message-new', 'message-old'])
    expect(messages[0].data.parts).toEqual([{ type: 'text', text: '你好🙂' }])
    expect(JSON.parse(topicBytes.toString('utf8')).id).toBe('topic')
    expect(result.included).toEqual({ bytes: messageBytes.length + topicBytes.length, messageCount: 2, recordCount: 3 })
    expect(result.warnings.size).toBe(0)
    expect(await readdir(path.join(tempRoot, 'chats'))).toEqual(['messages.jsonl', 'topics.jsonl'])
  })

  it('omits whole records when no chat budget remains', async () => {
    const candidates = await Array.fromAsync(collectChatRecords({ fromMs: 0, toMs: 3000 }).candidates)
    const result = await stageChatRecords(candidates, tempRoot, 0)
    expect(result.included).toEqual({ bytes: 0, messageCount: 0, recordCount: 0 })
    expect(result.warnings).toContain('size_limit_reached')
    expect(await readdir(path.join(tempRoot, 'chats'))).toEqual([])
  })

  it('keeps the other selected message when a message disappears before staging', async () => {
    const candidates = await Array.fromAsync(collectChatRecords({ fromMs: 0, toMs: 3000 }).candidates)
    dbh.db.delete(messageTable).where(eq(messageTable.id, 'message-new')).run()
    const result = await stageChatRecords(candidates, tempRoot, 1024 * 1024)
    expect(result.included.messageCount).toBe(1)
    expect(result.warnings).toContain('source_changed')
    expect(JSON.parse(await readFile(path.join(tempRoot, 'chats/messages.jsonl'), 'utf8')).id).toBe('message-old')
  })

  it('counts growth between selection and hydration against the actual byte budget', async () => {
    const candidates = await Array.fromAsync(collectChatRecords({ fromMs: 0, toMs: 3000 }).candidates)
    dbh.db
      .update(messageTable)
      .set({ data: { parts: [{ type: 'text', text: 'x'.repeat(8192) }] } })
      .where(eq(messageTable.id, 'message-new'))
      .run()
    const result = await stageChatRecords(candidates, tempRoot, 4096)
    expect(result.included.messageCount).toBe(1)
    expect(result.included.bytes).toBeLessThanOrEqual(4096)
    expect(result.warnings).toContain('size_limit_reached')
    expect(result.warnings).toContain('source_changed')
    expect(JSON.parse(await readFile(path.join(tempRoot, 'chats/messages.jsonl'), 'utf8')).id).toBe('message-old')
  })
})
