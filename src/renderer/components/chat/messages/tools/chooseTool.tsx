import type { NormalToolResponse } from '@renderer/types/mcpTool'
import { KB_SEARCH_TOOL_NAME, PROVIDER_WEB_SEARCH_TOOL_NAME, WEB_SEARCH_TOOL_NAME } from '@shared/ai/builtinTools'
import type { ReactNode } from 'react'

import { MessageKnowledgeSearchToolTitle } from './knowledge/MessageKnowledgeSearch'
import MessageMetaTool, { isMetaToolName } from './meta/MessageMetaTool'
import { isGenerateImageToolName } from './painting/generateImageTool'
import { MessageGenerateImageToolTitle } from './painting/MessageGenerateImage'
import { MessageWebSearchToolTitle } from './webSearch/MessageWebSearch'

export function chooseTool(toolResponse: NormalToolResponse): ReactNode | null {
  const toolName = toolResponse.tool.name
  if (isMetaToolName(toolName)) return <MessageMetaTool toolResponse={toolResponse} />
  if (toolName === KB_SEARCH_TOOL_NAME || toolName === 'builtin_knowledge_search') {
    return <MessageKnowledgeSearchToolTitle toolResponse={toolResponse} />
  }
  if (
    toolName === WEB_SEARCH_TOOL_NAME ||
    toolName === PROVIDER_WEB_SEARCH_TOOL_NAME ||
    toolName === 'builtin_web_search' ||
    toolName === 'builtin_web_search_preview'
  ) {
    return <MessageWebSearchToolTitle toolResponse={toolResponse} />
  }
  if (isGenerateImageToolName(toolName)) return <MessageGenerateImageToolTitle toolResponse={toolResponse} />
  return null
}
