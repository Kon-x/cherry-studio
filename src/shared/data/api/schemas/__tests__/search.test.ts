import { describe, expect, it } from 'vitest'

import {
  CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE,
  ContentSearchQuerySchema,
  ENTITY_SEARCH_MAX_LIMIT_PER_TYPE,
  EntitySearchQuerySchema
} from '../search'

describe('EntitySearchQuerySchema', () => {
  it('trims q without applying a default limit', () => {
    expect(EntitySearchQuerySchema.parse({ q: '  assistant  ' })).toEqual({
      q: 'assistant'
    })
  })

  it('accepts type filters and explicit positive limitPerType', () => {
    expect(
      EntitySearchQuerySchema.parse({
        q: 'agent',
        types: ['assistant', 'topic'],
        updatedAtFrom: '2026-05-01T00:00:00.000Z',
        limitPerType: ENTITY_SEARCH_MAX_LIMIT_PER_TYPE
      })
    ).toEqual({
      q: 'agent',
      types: ['assistant', 'topic'],
      updatedAtFrom: '2026-05-01T00:00:00.000Z',
      limitPerType: ENTITY_SEARCH_MAX_LIMIT_PER_TYPE
    })
  })

  it('rejects retired types, blank queries, invalid limits and unsupported flags', () => {
    expect(EntitySearchQuerySchema.safeParse({ q: 'old', types: ['agent', 'session'] }).success).toBe(false)
    expect(() => EntitySearchQuerySchema.parse({ q: '   ' })).toThrow()
    expect(() => EntitySearchQuerySchema.parse({ q: 'agent', updatedAtFrom: 'today' })).toThrow()
    expect(() => EntitySearchQuerySchema.parse({ q: 'agent', limitPerType: 0 })).toThrow()
    expect(() =>
      EntitySearchQuerySchema.parse({ q: 'agent', limitPerType: ENTITY_SEARCH_MAX_LIMIT_PER_TYPE + 1 })
    ).toThrow()
    expect(() => EntitySearchQuerySchema.parse({ q: 'agent', includeMessages: true })).toThrow()
  })
})

describe('ContentSearchQuerySchema', () => {
  it('trims q without applying a default limit', () => {
    expect(ContentSearchQuerySchema.parse({ q: '  message  ' })).toEqual({
      q: 'message'
    })
  })

  it('accepts source filters, per-source cursors, time, and explicit limitPerSource', () => {
    expect(
      ContentSearchQuerySchema.parse({
        q: 'needle',
        sources: ['topic-message'],
        cursors: { 'topic-message': '200:message-1' },
        filters: {
          'topic-message': { topicId: 'topic-1' }
        },
        createdAtFrom: '2026-05-01T00:00:00.000Z',
        limitPerSource: CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE
      })
    ).toEqual({
      q: 'needle',
      sources: ['topic-message'],
      cursors: { 'topic-message': '200:message-1' },
      filters: {
        'topic-message': { topicId: 'topic-1' }
      },
      createdAtFrom: '2026-05-01T00:00:00.000Z',
      limitPerSource: CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE
    })
  })

  it('rejects blank q, invalid sources, invalid filters, invalid createdAtFrom, and out-of-range limits', () => {
    expect(() => ContentSearchQuerySchema.parse({ q: 'old', sources: ['session-message'] })).toThrow()
    expect(() => ContentSearchQuerySchema.parse({ q: '   ' })).toThrow()
    expect(() => ContentSearchQuerySchema.parse({ q: 'message', sources: ['topic'] })).toThrow()
    expect(() => ContentSearchQuerySchema.parse({ q: 'message', cursors: { topic: '1:m1' } })).toThrow()
    expect(() => ContentSearchQuerySchema.parse({ q: 'message', cursors: { 'topic-message': '' } })).toThrow()
    expect(() =>
      ContentSearchQuerySchema.parse({ q: 'message', filters: { 'topic-message': { sessionId: 'session-1' } } })
    ).toThrow()
    expect(() =>
      ContentSearchQuerySchema.parse({ q: 'message', filters: { 'session-message': { topicId: 'topic-1' } } })
    ).toThrow()
    expect(() =>
      ContentSearchQuerySchema.parse({ q: 'message', filters: { 'knowledge-item': { knowledgeBaseId: 'kb-1' } } })
    ).toThrow()
    expect(() => ContentSearchQuerySchema.parse({ q: 'message', createdAtFrom: 'today' })).toThrow()
    expect(() => ContentSearchQuerySchema.parse({ q: 'message', limitPerSource: 0 })).toThrow()
    expect(() =>
      ContentSearchQuerySchema.parse({ q: 'message', limitPerSource: CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE + 1 })
    ).toThrow()
  })
})
