import { useAssistantApiById } from '@renderer/hooks/useAssistant'
import { useTopicById } from '@renderer/hooks/useTopic'

export function useGlobalSearchTopicContext(topicId: string) {
  const { topic } = useTopicById(topicId)
  const { assistant } = useAssistantApiById(topic?.assistantId ?? undefined)
  return { name: assistant?.name }
}
