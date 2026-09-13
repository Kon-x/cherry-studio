import { WindowType } from '@main/core/window/types'
import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from '@shared/data/presets/cherryai'
import { MockMainPreferenceServiceUtils } from '@test-mocks/main/PreferenceService'
import { mockMainLoggerService } from '@test-mocks/MainLoggerService'
import { app } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  broadcast: vi.fn(),
  broadcastToType: vi.fn(),
  getTopic: vi.fn(),
  updateTopic: vi.fn(),
  getMessageById: vi.fn(),
  getModelByKey: vi.fn(),
  getProviderByProviderId: vi.fn(),
  getAgent: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn()
}))

vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory({
    AiService: { generateText: mocks.generateText },
    IpcApiService: { broadcast: mocks.broadcast, broadcastToType: mocks.broadcastToType }
  } as never)
})

vi.mock('@data/services/TopicService', () => ({
  topicService: {
    getById: mocks.getTopic,
    update: mocks.updateTopic
  }
}))

vi.mock('@main/data/services/MessageService', () => ({
  messageService: {
    getById: mocks.getMessageById
  }
}))

vi.mock('@data/services/ModelService', () => ({
  modelService: {
    getByKey: mocks.getModelByKey
  }
}))

vi.mock('@data/services/ProviderService', () => ({
  providerService: {
    getByProviderId: mocks.getProviderByProviderId
  }
}))

const { TopicNamingService } = await import('../TopicNamingService')

function createService() {
  return new TopicNamingService()
}

function mockRenameInputs() {
  mocks.getTopic.mockReturnValue({
    id: 'topic-1',
    name: '',
    isNameManuallyEdited: false
  })
  mocks.getMessageById.mockReturnValue({
    id: 'message-1',
    role: 'user',
    data: { parts: [{ type: 'text', text: 'Hello there' }] }
  })
  mocks.generateText.mockResolvedValue({ text: 'Generated Title' })
}

describe('TopicNamingService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockMainPreferenceServiceUtils.resetMocks()
    mockMainLoggerService.warn.mockClear()
    mockMainLoggerService.debug.mockClear()
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.enabled', true)
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', 'openai::gpt-4o-mini')
    mocks.getModelByKey.mockReturnValue({ id: 'openai::gpt-4o-mini' })
    mocks.getProviderByProviderId.mockReturnValue({ authMethods: ['api-key'] })
    mockRenameInputs()
  })

  it('uses the quick assistant model for normal chat summary naming', async () => {
    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: { id: 'topic-1', topicId: 'topic-1' },
        uniqueModelId: 'openai::gpt-4o-mini'
      })
    )
    // A naming request must never carry the assistant id — buildAgentParams would
    // otherwise attach the assistant's tool configuration (MCP / web search /
    // knowledge bases) onto the throwaway title request.
    expect(mocks.generateText.mock.calls[0][0]).not.toHaveProperty('assistantId')
    expect(mocks.updateTopic).toHaveBeenCalledWith('topic-1', {
      name: 'Generated Title',
      isNameManuallyEdited: false
    })
    expect(mocks.broadcast).toHaveBeenCalledWith('ai.topic.auto_renamed', { topicId: 'topic-1' })
  })

  it('requests a title in the language selected in system settings', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('app.language', 'zh-CN')

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Chinese (Simplified)')
      })
    )
  })

  it('follows the system locale when app.language is null', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('app.language', null)
    vi.mocked(app.getLocale).mockReturnValueOnce('zh-CN')

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Chinese (Simplified)')
      })
    )
  })

  it('sends a naming-failed toast event to the main window when summary generation throws', async () => {
    mocks.generateText.mockRejectedValue(new Error('Invalid signature'))

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcastToType).toHaveBeenCalledWith(WindowType.Main, 'ai.topic.naming_failed', {
      message: 'Invalid signature'
    })
  })

  it('uses the chat default model when the quick model preference is empty', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', null)
    MockMainPreferenceServiceUtils.setPreferenceValue('chat.default_model_id', 'anthropic::claude-3-haiku')

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: 'anthropic::claude-3-haiku'
      })
    )
    expect(mocks.generateText.mock.calls[0][0]).not.toHaveProperty('assistantId')
  })

  it('falls back to the managed CherryAI default when the quick and chat default models are empty', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', null)
    MockMainPreferenceServiceUtils.setPreferenceValue('chat.default_model_id', null)

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID
      })
    )
  })

  it('falls back to the managed CherryAI default when the quick model preference is invalid', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', 'bad-value')
    MockMainPreferenceServiceUtils.setPreferenceValue('chat.default_model_id', 'anthropic::claude-3-haiku')

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID
      })
    )
    expect(mockMainLoggerService.warn).toHaveBeenCalledWith(
      'Quick assistant model is not usable for topic naming; falling back to managed CherryAI default',
      { configured: 'bad-value' }
    )
  })

  it('falls back to the managed CherryAI default when the quick model no longer exists', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', 'ghost::missing')
    mocks.getModelByKey.mockImplementation(() => {
      throw new Error('missing model')
    })

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getModelByKey).toHaveBeenCalledWith('ghost', 'missing')
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID
      })
    )
    expect(mockMainLoggerService.warn).toHaveBeenCalledWith(
      'Quick assistant model is not usable for topic naming; falling back to managed CherryAI default',
      { configured: 'ghost::missing' }
    )
  })

  it('names a topic from the first user message when conversation auto naming is disabled', () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.enabled', false)

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.updateTopic).toHaveBeenCalledWith('topic-1', {
      name: 'Hello there',
      isNameManuallyEdited: false
    })
    expect(mocks.generateText).not.toHaveBeenCalled()
  })

  it('does not first-message rename a topic after a manual rename race', async () => {
    mocks.getTopic
      .mockReturnValueOnce({
        id: 'topic-1',
        name: '',
        isNameManuallyEdited: false
      })
      .mockReturnValueOnce({
        id: 'topic-1',
        name: 'Manual Topic',
        isNameManuallyEdited: true
      })
    mocks.getMessageById.mockReturnValue({
      id: 'message-1',
      role: 'user',
      data: { parts: [{ type: 'text', text: 'First user text' }] }
    })

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.getTopic).toHaveBeenCalledTimes(2)
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('does not summary-rename a topic after a manual rename race', async () => {
    mocks.getTopic
      .mockReturnValueOnce({
        id: 'topic-1',
        name: 'Hello there',
        isNameManuallyEdited: false
      })
      .mockReturnValueOnce({
        id: 'topic-1',
        name: 'Manual Topic',
        isNameManuallyEdited: true
      })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getTopic).toHaveBeenCalledTimes(2)
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('does not first-message rename a topic that already has a real title', async () => {
    mocks.getTopic.mockReturnValue({
      id: 'topic-1',
      name: 'Existing Title',
      isNameManuallyEdited: false
    })

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('allows summary rename while the topic still has the first-message temporary title', async () => {
    mocks.getTopic.mockReturnValue({
      id: 'topic-1',
      name: 'Hello there',
      isNameManuallyEdited: false
    })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.updateTopic).toHaveBeenCalledWith('topic-1', {
      name: 'Generated Title',
      isNameManuallyEdited: false
    })
  })

  it('does not summary-rename a topic that already has a generated title', async () => {
    mocks.getTopic.mockReturnValue({
      id: 'topic-1',
      name: 'Generated Title',
      isNameManuallyEdited: false
    })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('uses an oauth login-based quick model (e.g. Codex/Grok) for topic naming', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', 'openai-codex::gpt-5')
    mocks.getProviderByProviderId.mockReturnValue({ authMethods: ['oauth'] })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getModelByKey).toHaveBeenCalledWith('openai-codex', 'gpt-5')
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: 'openai-codex::gpt-5'
      })
    )
  })

  it('does not persist a lone surrogate when the first-message title cut lands inside an emoji', () => {
    // CJK text carries no spaces, so first-message naming falls back to a hard
    // length cut at 50 chars. Place an emoji straddling that boundary: the 49
    // CJK chars fill indices 0-48, and the emoji's high/low surrogate halves sit
    // at indices 49/50. A naive slice(0, 50) keeps the high half but drops its
    // low partner, leaving a lone surrogate (renders as the replacement glyph).
    const longText = '字'.repeat(49) + '😀' + '文'.repeat(20)
    mocks.getMessageById.mockReturnValue({
      id: 'message-1',
      role: 'user',
      data: { parts: [{ type: 'text', text: longText }] }
    })

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.updateTopic).toHaveBeenCalledTimes(1)
    const renamedTo = mocks.updateTopic.mock.calls[0][1] as { name: string }
    // A lone surrogate is a high surrogate with no following low one (or a low
    // surrogate with no preceding high one) — exactly what a mid-pair cut leaves.
    const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(LONE_SURROGATE.test(renamedTo.name)).toBe(false)
  })

  describe('inFlightWrites registry', () => {
    // Entries self-remove a couple of microtasks after their promise settles
    // (trackNamingWrite chains `.catch().finally()` off the returned promise).
    const flushSettles = () => new Promise((resolve) => setImmediate(resolve))

    beforeEach(async () => {
      // Let deletion chains from earlier tests land before asserting absolute sizes —
      // the registry is module-level, shared across service instances.
      await flushSettles()
    })

    it('maybeRenameFromConversationSummary registers under the topic: prefix', async () => {
      const service = createService()

      const pending = service.maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Assistant response' }]
      } as never)

      expect(service.inFlightWrites().size).toBe(1)
      const [topicKey] = [...service.inFlightWrites().keys()]
      expect(topicKey).toMatch(/^topic:topic-1#\d+$/)

      await pending
      await flushSettles()
      expect(service.inFlightWrites().size).toBe(0)
    })
  })
})
