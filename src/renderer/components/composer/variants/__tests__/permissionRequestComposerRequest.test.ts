import type { CherryMessagePart } from '@shared/data/types/message'
import { describe, expect, it } from 'vitest'

import { findNextPendingPermissionRequest } from '../PermissionRequestComposer'

function makePart(overrides: Partial<Record<string, unknown>> = {}): CherryMessagePart {
  return {
    type: 'tool-Read',
    toolName: 'Read',
    toolCallId: 'call-1',
    state: 'approval-requested',
    input: { file_path: '/tmp/file.ts' },
    approval: { id: 'approval-1' },
    providerExecuted: true,
    ...overrides
  } as unknown as CherryMessagePart
}

describe('findNextPendingPermissionRequest', () => {
  it('returns pending permissions in FIFO order', () => {
    const partsByMessageId = {
      'message-1': [makePart()],
      'message-2': [
        makePart({ toolCallId: 'call-2', approval: { id: 'approval-2' } }),
        makePart({ toolCallId: 'call-3', approval: { id: 'approval-3' } })
      ]
    }
    const first = findNextPendingPermissionRequest(partsByMessageId)

    expect(first).toMatchObject({
      messageId: 'message-2',
      toolCallId: 'call-2',
      approvalId: 'approval-2',
      title: 'Read',
      toolResponse: {
        tool: { name: 'Read', type: 'provider' },
        status: 'pending',
        arguments: { file_path: '/tmp/file.ts' }
      }
    })
    expect(first?.match).toMatchObject({
      messageId: 'message-2',
      toolCallId: 'call-2',
      approvalId: 'approval-2',
      state: 'approval-requested'
    })

    expect(
      findNextPendingPermissionRequest({
        ...partsByMessageId,
        'message-2': [
          makePart({ toolCallId: 'call-2', approval: { id: 'approval-2' }, state: 'approval-responded' }),
          makePart({ toolCallId: 'call-3', approval: { id: 'approval-3' } })
        ]
      })
    ).toMatchObject({
      messageId: 'message-2',
      toolCallId: 'call-3',
      approvalId: 'approval-3'
    })
  })

  it('extracts a request title from descriptive tool input fields', () => {
    const result = findNextPendingPermissionRequest({
      'message-1': [
        makePart({
          input: {
            command: 'pnpm test',
            description: 'Run focused composer tests'
          }
        })
      ]
    })

    expect(result?.title).toBe('Run focused composer tests')
  })

  it('shows the target path for file-tool approvals', () => {
    const result = findNextPendingPermissionRequest({
      'message-1': [makePart({ input: { path: '/documents/notes.md' } })]
    })

    expect(result?.title).toBe('/documents/notes.md')
  })

  it('uses MCP server metadata for the tool preview', () => {
    const result = findNextPendingPermissionRequest({
      'message-1': [
        makePart({
          type: 'dynamic-tool',
          toolName: 'mcp__8171b5f3-c666-4ead-b2ab-bb9ac244af57__resolve-library-id',
          toolCallId: 'mcp-call-1',
          input: { query: 'composer' },
          approval: { id: 'mcp-approval-1' },
          callProviderMetadata: {
            cherry: {
              toolName: 'mcp__8171b5f3-c666-4ead-b2ab-bb9ac244af57__resolve-library-id',
              tool: {
                type: 'mcp',
                serverId: '8171b5f3-c666-4ead-b2ab-bb9ac244af57',
                serverName: 'Context7',
                name: 'resolve-library-id',
                description: 'Resolve a package name into a Context7 library ID.'
              }
            }
          }
        })
      ]
    })

    expect(result).toMatchObject({
      messageId: 'message-1',
      toolCallId: 'mcp-call-1',
      approvalId: 'mcp-approval-1',
      toolResponse: {
        tool: {
          name: 'resolve-library-id',
          description: 'Resolve a package name into a Context7 library ID.',
          type: 'mcp',
          serverId: '8171b5f3-c666-4ead-b2ab-bb9ac244af57',
          serverName: 'Context7'
        },
        arguments: { query: 'composer' }
      }
    })
  })

  it('ignores invalid and already responded tool parts', () => {
    const result = findNextPendingPermissionRequest({
      'message-1': [
        makePart({ state: 'approval-responded' }),
        makePart({ approval: undefined }),
        makePart({ toolCallId: undefined }),
        { type: 'text', text: 'hello' } as CherryMessagePart
      ]
    })

    expect(result).toBeNull()
  })
})
