import '@data/services/MessageService'
import { setupTestDatabase, withRoot } from '@test-helpers/db'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { assistantTable } from '@data/db/schemas/assistant'
import { messageTable } from '@data/db/schemas/message'
import { pinTable } from '@data/db/schemas/pin'
import { topicTable } from '@data/db/schemas/topic'
import { assistantDataService } from '@data/services/AssistantService'
import { topicService } from '@data/services/TopicService'
import { ErrorCode } from '@shared/data/api/errors'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'

describe('pinned active permanent deletion', () => {
  const dbh = setupTestDatabase()

  function seedConversations(): void {
    dbh.db
      .insert(assistantTable)
      .values({
        id: 'assistant',
        name: 'Assistant',
        emoji: '',
        settings: DEFAULT_ASSISTANT_SETTINGS,
        orderKey: 'a0'
      })
      .run()
    dbh.db
      .insert(topicTable)
      .values([
        { id: 'active-topic', assistantId: 'assistant', name: 'Active topic', orderKey: 'a0' },
        { id: 'other-topic', assistantId: 'assistant', name: 'Other topic', orderKey: 'a1' },
        { id: 'archived-topic', assistantId: 'assistant', name: 'Archived topic', orderKey: 'a2', deletedAt: 123 },
        { id: 'unrelated-topic', name: 'Unrelated topic', orderKey: 'a3' }
      ])
      .run()
    dbh.db
      .insert(messageTable)
      .values([
        ...withRoot('active-topic', [
          {
            id: 'user-active-topic',
            topicId: 'active-topic',
            role: 'user',
            data: { parts: [{ type: 'text', text: 'active topic body' }] },
            status: 'success'
          }
        ]),
        ...withRoot('other-topic', [
          {
            id: 'user-other-topic',
            topicId: 'other-topic',
            role: 'user',
            data: { parts: [{ type: 'text', text: 'other topic body' }] },
            status: 'success'
          }
        ]),
        ...withRoot('archived-topic', [
          {
            id: 'user-archived-topic',
            topicId: 'archived-topic',
            role: 'user',
            data: { parts: [{ type: 'text', text: 'archived topic body' }] },
            status: 'success'
          }
        ]),
        ...withRoot('unrelated-topic', [])
      ])
      .run()
  }

  function pin(entityType: 'topic' | 'session', entityId: string): void {
    dbh.db
      .insert(pinTable)
      .values({ entityType, entityId, orderKey: `pin-${entityId}` })
      .run()
  }

  function topicIds(): string[] {
    return dbh.db
      .select({ id: topicTable.id })
      .from(topicTable)
      .all()
      .map((row) => row.id)
      .sort()
  }

  function messageText(topicId: string): string | undefined {
    const row = dbh.db
      .select()
      .from(messageTable)
      .where(eq(messageTable.id, `user-${topicId}`))
      .get()
    const text = row?.data.parts?.[0]
    return text && 'text' in text ? text.text : undefined
  }

  it('rejects a topic pinned after selection and leaves the topic, message, and pin', () => {
    seedConversations()
    expect(topicService.getById('active-topic').id).toBe('active-topic')
    pin('topic', 'active-topic')

    expect(() => topicService.deleteByIds(['active-topic'], { permanent: true, targetState: 'active' })).toThrow(
      expect.objectContaining({
        code: ErrorCode.INVALID_OPERATION,
        details: { operation: 'delete pinned topic', reason: 'active-topic' }
      })
    )

    expect(topicIds()).toEqual(['active-topic', 'archived-topic', 'other-topic', 'unrelated-topic'])
    expect(messageText('active-topic')).toBe('active topic body')
    expect(dbh.db.select({ entityId: pinTable.entityId }).from(pinTable).all()).toEqual([{ entityId: 'active-topic' }])
  })

  it('rejects a mixed active topic batch without deleting the unpinned topic', () => {
    seedConversations()
    pin('topic', 'active-topic')

    expect(() =>
      topicService.deleteByIds(['other-topic', 'active-topic'], { permanent: true, targetState: 'active' })
    ).toThrow(
      expect.objectContaining({
        code: ErrorCode.INVALID_OPERATION,
        details: { operation: 'delete pinned topic', reason: 'active-topic' }
      })
    )

    expect(messageText('active-topic')).toBe('active topic body')
    expect(messageText('other-topic')).toBe('other topic body')
    expect(dbh.db.select().from(pinTable).all()).toHaveLength(1)
  })

  it('permanently deletes an unpinned active topic and its messages', () => {
    seedConversations()
    pin('session', 'active-topic')

    expect(topicService.deleteByIds(['active-topic'], { permanent: true, targetState: 'active' })).toEqual({
      deletedIds: ['active-topic'],
      deletedCount: 1
    })

    expect(topicIds()).toEqual(['archived-topic', 'other-topic', 'unrelated-topic'])
    expect(dbh.db.select().from(messageTable).where(eq(messageTable.topicId, 'active-topic')).all()).toEqual([])
    expect(messageText('other-topic')).toBe('other topic body')
    expect(dbh.db.select({ entityId: pinTable.entityId }).from(pinTable).all()).toEqual([{ entityId: 'active-topic' }])
  })

  it('keeps NOT_FOUND when an active topic batch includes a missing or archived id', () => {
    seedConversations()
    pin('topic', 'active-topic')
    pin('topic', 'archived-topic')
    pin('topic', 'missing-topic')

    expect(() =>
      topicService.deleteByIds(['active-topic', 'missing-topic'], { permanent: true, targetState: 'active' })
    ).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND, details: { resource: 'Topic', id: 'missing-topic' } })
    )
    expect(() =>
      topicService.deleteByIds(['other-topic', 'archived-topic'], { permanent: true, targetState: 'active' })
    ).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND, details: { resource: 'Topic', id: 'archived-topic' } })
    )

    expect(topicIds()).toEqual(['active-topic', 'archived-topic', 'other-topic', 'unrelated-topic'])
    expect(messageText('other-topic')).toBe('other topic body')
    expect(
      dbh.db
        .select({ entityId: pinTable.entityId })
        .from(pinTable)
        .all()
        .map((row) => row.entityId)
        .sort()
    ).toEqual(['active-topic', 'archived-topic', 'missing-topic'])
  })

  it('purges a pinned topic that is already in the recycle bin', () => {
    seedConversations()
    pin('topic', 'archived-topic')
    pin('topic', 'active-topic')

    expect(topicService.deleteByIds(['archived-topic'], { permanent: true, targetState: 'trashed' })).toEqual({
      deletedIds: ['archived-topic'],
      deletedCount: 1
    })

    expect(topicService.getById('active-topic').deletedAt).toBeUndefined()
    expect(messageText('active-topic')).toBe('active topic body')
    expect(dbh.db.select().from(messageTable).where(eq(messageTable.topicId, 'archived-topic')).all()).toEqual([])
    expect(dbh.db.select({ entityId: pinTable.entityId }).from(pinTable).all()).toEqual([{ entityId: 'active-topic' }])
  })

  it('deletes pinned active and archived topics when assistant deletion explicitly deletes children', () => {
    seedConversations()
    pin('topic', 'active-topic')
    pin('topic', 'archived-topic')

    const result = assistantDataService.delete('assistant', {
      permanent: true,
      targetState: 'active',
      deleteTopics: true
    })

    expect(result.deleted).toBe(true)
    expect(result.deletedTopicIds?.sort()).toEqual(['active-topic', 'archived-topic', 'other-topic'])
    expect(topicIds()).toEqual(['unrelated-topic'])
    expect(dbh.db.select().from(assistantTable).all()).toEqual([])
    expect(dbh.db.select().from(pinTable).all()).toEqual([])
  })
})
