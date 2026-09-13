import type { AiStreamOpenRequest } from '@shared/ai/transport'
import { describe, expect, it } from 'vitest'

import { aiRequestSchemas } from '../ai'

// The AI IPC boundary validates `uniqueModelId` with the strict `UniqueModelIdSchema`
// (`providerId::modelId`, separator at a real position, both parts well-formed), so a
// malformed id is rejected here instead of penetrating to `parseUniqueModelId` and
// throwing deeper in the routing code.
describe('ai IPC schemas — uniqueModelId validation', () => {
  const genText = aiRequestSchemas['ai.text.generate'].input
  const genImage = aiRequestSchemas['ai.image.generate'].input

  it('accepts a well-formed providerId::modelId (shared aiBaseRequestShape)', () => {
    expect(genText.safeParse({ uniqueModelId: 'openai::gpt-4o', prompt: 'hi' }).success).toBe(true)
  })

  it('rejects a malformed uniqueModelId (missing/leading separator, empty part, non-string)', () => {
    for (const uniqueModelId of ['no-separator', '::gpt-4o', 'openai::', 42]) {
      expect(genText.safeParse({ uniqueModelId, prompt: 'hi' }).success).toBe(false)
    }
  })

  it('still allows uniqueModelId to be omitted (optional)', () => {
    expect(genText.safeParse({ prompt: 'hi' }).success).toBe(true)
  })

  it('validates the nested payload uniqueModelId for ai.image.generate', () => {
    const input = (uniqueModelId: string) => ({
      requestId: 'r1',
      payload: { uniqueModelId, prompt: 'a fox', paramValues: {}, cleanupPolicy: 'delete_when_unreferenced' }
    })
    expect(genImage.safeParse(input('openai::gpt-image')).success).toBe(true)
    expect(genImage.safeParse(input('bad-id')).success).toBe(false)
  })
})

describe('ai.stream.open IPC schema', () => {
  const openStream = aiRequestSchemas['ai.stream.open'].input

  it('preserves reserved-branch target intent at the renderer-to-main boundary', () => {
    expect(
      openStream.parse({
        trigger: 'submit-message',
        topicId: 'topic-1',
        parentAnchorId: 'reserved-user',
        userMessageParts: [{ type: 'text', text: 'continue branch' }],
        targetMode: 'reserved-branch'
      })
    ).toMatchObject({ targetMode: 'reserved-branch' })
  })

  it('rejects an unknown target mode', () => {
    expect(
      openStream.safeParse({
        trigger: 'submit-message',
        topicId: 'topic-1',
        userMessageParts: [],
        targetMode: 'current-stream'
      }).success
    ).toBe(false)
  })

  it('accepts an explicit failed assistant row for in-place retry', () => {
    expect(
      openStream.parse({
        trigger: 'regenerate-message',
        topicId: 'topic-1',
        parentAnchorId: 'user-1',
        retryMessageId: 'assistant-failed',
        mentionedModelIds: ['openai::gpt-4o']
      })
    ).toMatchObject({ retryMessageId: 'assistant-failed' })
  })

  it('preserves an explicit live reply-group append target', () => {
    expect(
      openStream.parse({
        trigger: 'regenerate-message',
        topicId: 'topic-1',
        parentAnchorId: 'user-1',
        appendToLiveGroupMessageId: 'assistant-source',
        mentionedModelIds: ['anthropic::claude-sonnet']
      })
    ).toMatchObject({ appendToLiveGroupMessageId: 'assistant-source' })
  })

  it('rejects duplicate mentioned model ids before dispatch', () => {
    expect(
      openStream.safeParse({
        trigger: 'submit-message',
        topicId: 'topic-1',
        userMessageParts: [],
        mentionedModelIds: ['openai::gpt-4o', 'openai::gpt-4o']
      }).success
    ).toBe(false)
  })

  it('rejects combining in-place retry with live reply-group append', () => {
    const combined = {
      trigger: 'regenerate-message',
      topicId: 'topic-1',
      parentAnchorId: 'user-1',
      retryMessageId: 'assistant-failed',
      appendToLiveGroupMessageId: 'assistant-source'
    } as const

    // @ts-expect-error retry and append are mutually exclusive in the shared request contract
    const invalidRequest: AiStreamOpenRequest = combined

    expect(openStream.safeParse(invalidRequest).success).toBe(false)
  })
})
