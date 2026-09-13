import type { ChatRouteSearch } from '@renderer/pages/home/routeSearch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveAgentEntrySessionId: vi.fn(),
  resolveAgentEntrySessionIdForAgent: vi.fn(),
  resolveChatEntryTopicId: vi.fn(),
  resolveChatEntryTopicIdForAssistant: vi.fn()
}))
vi.mock('@renderer/pages/home/HomePage', () => ({ default: () => null }))
vi.mock('@renderer/utils/conversationEntry', () => mocks)

import { Route as ChatRoute } from '../chat'

type EntryBeforeLoad<TSearch> = (args: { search: TSearch }) => Promise<void>

const chatBeforeLoad = ChatRoute.options.beforeLoad as EntryBeforeLoad<ChatRouteSearch>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveChatEntryTopicId.mockResolvedValue(null)
  mocks.resolveAgentEntrySessionId.mockResolvedValue(null)
  mocks.resolveChatEntryTopicIdForAssistant.mockResolvedValue(null)
  mocks.resolveAgentEntrySessionIdForAgent.mockResolvedValue(null)
})

describe('conversation entry route guards', () => {
  it('resolves the entry target for a bare chat entry', async () => {
    mocks.resolveChatEntryTopicId.mockResolvedValue('topic-last')

    await expect(chatBeforeLoad({ search: {} })).rejects.toMatchObject({
      options: { to: '/app/chat', search: { topicId: 'topic-last' }, replace: true }
    })
  })

  it('does not resolve a chat entry that already carries a topic id', async () => {
    await chatBeforeLoad({ search: { topicId: 'topic-a' } })

    expect(mocks.resolveChatEntryTopicId).not.toHaveBeenCalled()
  })

  it('resolves an assistant-scoped topic for a sidebar assistant entry', async () => {
    mocks.resolveChatEntryTopicIdForAssistant.mockResolvedValue('topic-assistant')

    await expect(chatBeforeLoad({ search: { assistantId: 'assistant-1' } })).rejects.toMatchObject({
      options: { to: '/app/chat', search: { topicId: 'topic-assistant' }, replace: true }
    })

    expect(mocks.resolveChatEntryTopicIdForAssistant).toHaveBeenCalledWith('assistant-1')
    expect(mocks.resolveChatEntryTopicId).not.toHaveBeenCalled()
  })

  it('falls through bare when the assistant has no topics', async () => {
    await chatBeforeLoad({ search: { assistantId: 'assistant-1' } })

    expect(mocks.resolveChatEntryTopicIdForAssistant).toHaveBeenCalledWith('assistant-1')
    expect(mocks.resolveChatEntryTopicId).not.toHaveBeenCalled()
  })
})
