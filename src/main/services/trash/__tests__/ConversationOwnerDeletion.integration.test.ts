import '@data/services/MessageService'
import { setupTestDatabase } from '@test-helpers/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assistantTable } from '@data/db/schemas/assistant'
import { topicTable } from '@data/db/schemas/topic'
import { assistantDataService } from '@data/services/AssistantService'
import { BaseService } from '@main/core/lifecycle/BaseService'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'

import { TrashService } from '../TrashService'

const mocks = vi.hoisted(() => ({ busy: false, runtimeBusy: false }))
vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory({
    AiStreamManager: {
      isWriteQuiesced: false,
      withDispatchLock: (_id: string, operation: () => unknown) => operation(),
      hasUnsettledTopicWork: () => mocks.busy,
      pauseRuntimeTurn: vi.fn()
    }
  } as Parameters<typeof mockApplicationFactory>[0])
})

describe('conversation owner permanent deletion', () => {
  const dbh = setupTestDatabase()

  beforeEach(() => {
    BaseService.resetInstances()
    mocks.busy = false
    mocks.runtimeBusy = false
    dbh.db
      .insert(assistantTable)
      .values({ id: 'assistant', name: 'Assistant', emoji: '', settings: DEFAULT_ASSISTANT_SETTINGS, orderKey: 'a0' })
      .run()
    dbh.db
      .insert(topicTable)
      .values([
        { id: 'active-topic', assistantId: 'assistant', name: 'Active', orderKey: 'a0' },
        { id: 'archived-topic', assistantId: 'assistant', name: 'Archived', orderKey: 'a1', deletedAt: 123 },
        { id: 'unrelated-topic', name: 'Unrelated', orderKey: 'a2' }
      ])
      .run()
  })

  it.each([false, true])(
    'deletes the assistant and only removes related topics when selected: %s',
    async (deleteTopics) => {
      const result = await new TrashService().deleteActiveAssistantPermanently('assistant', deleteTopics)
      expect(result.deleted).toBe(true)
      expect(dbh.db.select().from(assistantTable).all()).toEqual([])
      const topics = dbh.db.select().from(topicTable).all()
      expect(topics.map((topic) => topic.id).sort()).toEqual(
        deleteTopics ? ['unrelated-topic'] : ['active-topic', 'archived-topic', 'unrelated-topic']
      )
      if (!deleteTopics) {
        expect(topics.find((topic) => topic.id === 'active-topic')).toMatchObject({
          assistantId: null,
          deletedAt: null
        })
        expect(topics.find((topic) => topic.id === 'archived-topic')).toMatchObject({
          assistantId: null,
          deletedAt: 123
        })
      }
      expect(() => assistantDataService.restore('assistant')).toThrow()
    }
  )
})
