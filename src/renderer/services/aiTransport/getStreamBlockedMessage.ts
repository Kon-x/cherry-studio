import i18n from '@renderer/i18n/resolver'

export function getStreamBlockedMessage(): string {
  return i18n.t('restore.messages_paused')
}
