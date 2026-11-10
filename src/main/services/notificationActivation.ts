import { application } from '@application'
import { knowledgeBaseService } from '@data/services/KnowledgeBaseService'
import { notificationRecordService } from '@data/services/NotificationRecordService'
import { topicService } from '@data/services/TopicService'
import { loggerService } from '@logger'
import { t } from '@main/i18n'
import type { ConversationNavigationTarget } from '@shared/types/navigation'

import { openNotificationInMainWindow, openRouteInMainWindow } from './mainWindowNavigation'

const logger = loggerService.withContext('notificationActivation')

export async function activateNotification(id: string): Promise<void> {
  const record = notificationRecordService.getById(id)
  if (!record) throw new Error(t('notification.center.target_unavailable'))
  notificationRecordService.markRead(id)
  const target = record.target
  if (!target) return
  if (target.kind === 'conversation') {
    try {
      if (target.conversationType !== 'assistant') throw new Error('Retired conversation')
      const entity = topicService.getById(target.conversationId)
      if (entity.deletedAt) throw new Error('Deleted conversation')
    } catch {
      throw new Error(t('notification.center.target_unavailable'))
    }
    const conversation = { conversationType: 'assistant' as const, conversationId: target.conversationId }
    await application
      .get('ConversationNavigationService')
      .focusOrOpen(conversation, resolveNotificationConversationName(conversation), null, undefined, target.messageId)
  } else if (target.kind === 'scheduled-task') {
    throw new Error(t('notification.center.target_unavailable'))
  } else if (target.kind === 'settings') {
    openRouteInMainWindow(`/settings/${target.tab}`)
  } else if (target.kind === 'knowledge') {
    try {
      knowledgeBaseService.getById(target.baseId)
    } catch {
      throw new Error(t('notification.center.target_unavailable'))
    }
    openRouteInMainWindow(`/app/knowledge?baseId=${encodeURIComponent(target.baseId)}`)
  } else {
    openNotificationInMainWindow(id)
  }
}

export function resolveNotificationConversationName(
  target: ConversationNavigationTarget,
  fallback = t('chat.conversation.new')
): string {
  try {
    const name = topicService.getById(target.conversationId).name
    return name.trim() || fallback
  } catch (error) {
    logger.warn('Failed to resolve conversation name for notification', { target, err: error })
    return fallback
  }
}
