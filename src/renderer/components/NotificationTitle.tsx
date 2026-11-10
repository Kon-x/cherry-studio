import { EmojiIcon } from '@cherrystudio/ui'
import { useQuery } from '@data/hooks/useDataApi'
import { DEFAULT_ASSISTANT_EMOJI } from '@shared/data/presets/defaultAssistant'
import type { NotificationRecord } from '@shared/data/types/notification'

import { notificationPreview } from './notificationPresentation'

function NotificationIdentity({ name, emoji }: { name: string; emoji: string }) {
  return (
    <span
      className="flex min-w-0 max-w-[40%] shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground"
      title={name}>
      <EmojiIcon emoji={emoji} size={14} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

function AssistantNotificationLabel({ topicId }: { topicId: string }) {
  const { data: topic, error: topicError } = useQuery('/topics/:id', {
    params: { id: topicId },
    swrOptions: { shouldRetryOnError: false }
  })
  const { data: assistant, error: assistantError } = useQuery('/assistants/:id', {
    params: { id: topic?.assistantId ?? '' },
    enabled: !!topic?.assistantId && !topicError,
    swrOptions: { shouldRetryOnError: false }
  })
  if (topicError || assistantError || !assistant?.name) return null

  return <NotificationIdentity name={assistant.name} emoji={assistant.emoji?.trim() || DEFAULT_ASSISTANT_EMOJI} />
}

export function NotificationTitle({ record }: { record: NotificationRecord }) {
  const result = record.target?.result
  const target =
    (record.kind === 'task-completion' || record.kind === 'queue-completion' || result) &&
    record.target?.kind === 'conversation' &&
    record.target.conversationType === 'assistant'
      ? record.target
      : undefined
  if (!target && !result?.actor) return notificationPreview(record.title, true)

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">{notificationPreview(record.title, true)}</span>
      {result?.actor ? (
        <NotificationIdentity {...result.actor} />
      ) : target ? (
        <AssistantNotificationLabel topicId={target.conversationId} />
      ) : null}
    </span>
  )
}
