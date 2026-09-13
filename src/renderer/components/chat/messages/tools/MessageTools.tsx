import { useToolResult } from '@renderer/hooks/useToolResult'
import type { McpToolResponse, NormalToolResponse } from '@renderer/types/mcpTool'
import { normalizeToolOutputResponse } from '@renderer/utils/message/toolOutput'
import type { DeferredToolOutput } from '@shared/ai/transport'
import { envelopeDisplayExcerpt, isDeferredToolOutput, isPersistedToolOutput } from '@shared/ai/transport'
import { useMemo } from 'react'

import { useMessagePartsScopeId } from '../blocks/MessagePartsContext'
import { useOptionalMessageListTopicId } from '../MessageListProvider'
import MessageMcpTool from './mcp/MessageMcpTool'
import MessageTool, { canRenderMessageToolResponse } from './MessageTool'
import { normalizeToolErrorResponse } from './toolResponse'

interface Props {
  toolResponse: McpToolResponse | NormalToolResponse
}

/**
 * The single gate every tool card passes through, so it holds the invariant they rely on:
 * `toolResponse.response` is always the real value, never a deferred placeholder.
 */
export default function MessageTools({ toolResponse }: Props) {
  const scopeMessageId = useMessagePartsScopeId()
  const topicId = useOptionalMessageListTopicId()
  const deferredOutput = useMemo((): DeferredToolOutput | undefined => {
    const response = toolResponse.response
    if (isDeferredToolOutput(response)) return response
    // Cold-loaded parts arrive unprojected (the topics GET serves raw message
    // data), so a bare persisted envelope can reach here — convert it to the
    // same deferred reference + excerpt the stream projection produces.
    if (isPersistedToolOutput(response) && topicId && scopeMessageId && toolResponse.toolCallId) {
      const ref = response.$persistedToolOutput
      return {
        $deferredToolResult: { topicId, messageId: scopeMessageId, toolCallId: toolResponse.toolCallId },
        excerpt: envelopeDisplayExcerpt(ref),
        ...(ref.shape === 'entities' ? { skeleton: ref.skeleton } : {})
      }
    }
    return undefined
  }, [scopeMessageId, toolResponse, topicId])
  const { output, error, isLoading } = useToolResult(deferredOutput?.$deferredToolResult)

  const resolvedToolResponse = useMemo(() => {
    if (!deferredOutput) return toolResponse
    if (isLoading) {
      // A persisted excerpt is real content — show it immediately instead of a
      // spinner; the resolved full value replaces it when the fetch lands.
      if (deferredOutput.excerpt) {
        const { head, tail } = deferredOutput.excerpt
        return { ...toolResponse, response: normalizeToolOutputResponse([head, '…', tail].filter(Boolean).join('\n')) }
      }
      return { ...toolResponse, status: 'invoking' as const, response: undefined }
    }
    if (error) {
      return {
        ...toolResponse,
        status: 'error' as const,
        response: normalizeToolErrorResponse(error instanceof Error ? error.message : String(error))
      }
    }
    return { ...toolResponse, response: normalizeToolOutputResponse(output) }
  }, [deferredOutput, error, isLoading, output, toolResponse])

  if (
    resolvedToolResponse.tool.type !== 'mcp' &&
    canRenderMessageToolResponse(resolvedToolResponse as NormalToolResponse)
  ) {
    return <MessageTool toolResponse={resolvedToolResponse as NormalToolResponse} />
  }
  return <MessageMcpTool toolResponse={resolvedToolResponse} />
}
