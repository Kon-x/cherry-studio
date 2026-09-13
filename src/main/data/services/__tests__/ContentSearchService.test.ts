import { assistantTable } from '@data/db/schemas/assistant'
import { messageTable } from '@data/db/schemas/message'
import { topicTable } from '@data/db/schemas/topic'
import { ContentSearchQuerySchema } from '@shared/data/api/schemas/search'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'
import { setupTestDatabase } from '@test-helpers/db'
import { beforeEach, describe, expect, it } from 'vitest'

import { contentSearchService } from '../ContentSearchService'

describe('ContentSearchService', () => {
  const dbh = setupTestDatabase()
  beforeEach(() => {
    dbh.db
      .insert(assistantTable)
      .values({
        id: 'assistant',
        name: 'Assistant',
        emoji: '💬',
        prompt: '',
        settings: DEFAULT_ASSISTANT_SETTINGS,
        orderKey: 'a0'
      })
      .run()
    for (const [index, topicId] of ['topic', 'other'].entries()) {
      dbh.db
        .insert(topicTable)
        .values({ id: topicId, assistantId: 'assistant', name: topicId, orderKey: `a${index}` })
        .run()
      dbh.db
        .insert(messageTable)
        .values({ id: `${topicId}-root`, topicId, role: 'root', status: 'success', data: { parts: [] } })
        .run()
      for (let i = 1; i <= 2; i++) {
        dbh.db
          .insert(messageTable)
          .values({
            id: `${topicId}-${i}`,
            topicId,
            parentId: `${topicId}-root`,
            role: 'user',
            status: 'success',
            data: { parts: [{ type: 'text', text: `needle message ${i}` }] },
            createdAt: Date.parse(`2026-05-0${i}T00:00:00Z`)
          })
          .run()
      }
    }
  })

  it('searches ordinary chats and paginates within the selected topic', () => {
    const query = ContentSearchQuerySchema.parse({
      q: ' needle ',
      filters: { 'topic-message': { topicId: 'topic' } },
      limitPerSource: 1
    })
    const first = contentSearchService.search(query)
    expect(first.query).toBe('needle')
    expect(first.groups).toMatchObject([
      { sourceType: 'topic-message', items: [{ messageId: 'topic-2', topicId: 'topic' }] }
    ])
    expect(first.groups[0].nextCursor).toEqual(expect.any(String))
    const next = contentSearchService.search({ ...query, cursors: { 'topic-message': first.groups[0].nextCursor } })
    expect(next.groups).toMatchObject([
      { sourceType: 'topic-message', items: [{ messageId: 'topic-1', topicId: 'topic' }] }
    ])
    expect(next.groups[0].nextCursor).toBeUndefined()
  })

  it('applies the creation-time filter and leaves unmatched queries empty', () => {
    const result = contentSearchService.search(
      ContentSearchQuerySchema.parse({ q: 'needle', createdAtFrom: '2026-05-02T00:00:00Z' })
    )
    expect(result.groups[0].items.map(({ messageId }) => messageId).sort()).toEqual(['other-2', 'topic-2'])
    expect(contentSearchService.search({ q: 'absent' }).groups).toEqual([
      { sourceType: 'topic-message', items: [], nextCursor: undefined }
    ])
  })

  it('reports invalid cursors against the public source-specific field', () => {
    expect(() => contentSearchService.search({ q: 'needle', cursors: { 'topic-message': 'bad-cursor' } })).toThrowError(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: { fieldErrors: { 'cursors.topic-message': expect.any(Array) } }
      })
    )
  })
})
