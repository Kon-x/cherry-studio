import { useTranslation } from 'react-i18next'

import { EmojiIcon, Tooltip } from '@cherrystudio/ui'
import { useQuery } from '@data/hooks/useDataApi'
import { DEFAULT_ASSISTANT_EMOJI } from '@shared/data/presets/defaultAssistant'
import type { NotificationRecord } from '@shared/data/types/notification'

import { notificationPreview } from './notificationPresentation'

function NotificationIdentity({ name, emoji }: { name: string; emoji?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Tooltip content={name} asChild>
        <span tabIndex={0} className="min-w-0 truncate rounded-sm focus-visible:bg-accent">
          {name}
        </span>
      </Tooltip>
      {emoji && (
        <span className="flex size-5 shrink-0 items-center justify-center">
          <EmojiIcon emoji={emoji} size={18} />
        </span>
      )}
    </span>
  )
}

function AssistantNotificationLabel({
  topicId,
  snapshot
}: {
  topicId: string
  snapshot?: { name: string; emoji: string }
}) {
  const { t } = useTranslation()
  const { data: topic, error: topicError } = useQuery('/topics/:id', {
    params: { id: topicId },
    swrOptions: { shouldRetryOnError: false }
  })
  const { data: assistant, error: assistantError } = useQuery('/assistants/:id', {
    params: { id: topic?.assistantId ?? '' },
    enabled: !!topic?.assistantId && !topicError,
    swrOptions: { shouldRetryOnError: false }
  })
  const current = !topicError && !assistantError ? assistant : undefined
  return (
    <NotificationIdentity
      name={current?.name?.trim() || snapshot?.name || t('chat.topics.display.assistant')}
      emoji={current?.emoji?.trim() || snapshot?.emoji || DEFAULT_ASSISTANT_EMOJI}
    />
  )
}

export function NotificationTaskIdentity({ record }: { record: NotificationRecord }) {
  const target = record.target
  if (target?.kind !== 'conversation' || target.conversationType !== 'assistant')
    return notificationPreview(record.title, true)
  return <AssistantNotificationLabel topicId={target.conversationId} snapshot={target.result?.actor} />
}
