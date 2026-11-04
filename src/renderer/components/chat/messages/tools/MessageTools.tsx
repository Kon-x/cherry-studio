import type { McpToolResponse, NormalToolResponse } from '@renderer/types/mcpTool'

import MessageMcpTool from './mcp/MessageMcpTool'
import MessageTool, { canRenderMessageToolResponse } from './MessageTool'
import { useResolvedToolResponse } from './useResolvedToolResponse'

interface Props {
  toolResponse: McpToolResponse | NormalToolResponse
}

/**
 * The single gate every tool card passes through, so it holds the invariant they rely on:
 * `toolResponse.response` is always the real value, never a deferred placeholder.
 */
export default function MessageTools({ toolResponse }: Props) {
  const resolvedToolResponse = useResolvedToolResponse(toolResponse)

  if (
    resolvedToolResponse.tool.type !== 'mcp' &&
    canRenderMessageToolResponse(resolvedToolResponse as NormalToolResponse)
  ) {
    return <MessageTool toolResponse={resolvedToolResponse as NormalToolResponse} />
  }
  return <MessageMcpTool toolResponse={resolvedToolResponse} />
}
