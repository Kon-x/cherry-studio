import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox, ConfirmDialog, Label } from '@cherrystudio/ui'
import { usePreference } from '@data/hooks/usePreference'
import { createPopup, type PopupInjectedProps } from '@renderer/services/popup'
import { toast } from '@renderer/services/toast'
import { formatErrorMessage } from '@renderer/utils/error'

export interface DeleteConversationOwnerConfirmDialogProps {
  type: 'assistant'
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (deleteChildren: boolean) => void | Promise<void>
  mode?: 'archive' | 'permanent'
  name?: string
}

// A resolved confirm must be allowed to close. Dismissal and a second submit stay
// blocked while that confirm is in flight, before `pending` re-renders.
function useDeletionConfirmGuard(
  open: boolean,
  pending: boolean,
  onOpenChange: (open: boolean) => void,
  onReset?: () => void
) {
  const submittingRef = useRef(false)
  const confirmedCloseRef = useRef(false)

  const runConfirm = async (action: () => void | Promise<void>): Promise<false | void> => {
    if (submittingRef.current || pending) return false
    submittingRef.current = true
    try {
      await action()
      confirmedCloseRef.current = true
    } catch {
      // ConfirmDialog keeps itself open when confirm returns false, so a later
      // Cancel or Escape must still reach onOpenChange.
      submittingRef.current = false
      return false
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !confirmedCloseRef.current && (pending || submittingRef.current)) return

    if (!next || !open) onReset?.()
    if (!next) {
      submittingRef.current = false
      confirmedCloseRef.current = false
    }
    onOpenChange(next)
  }

  return { runConfirm, handleOpenChange }
}

export function DeleteConversationOwnerConfirmDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
  mode = 'archive',
  name
}: DeleteConversationOwnerConfirmDialogProps) {
  const { t } = useTranslation()
  const checkboxId = useId()
  const [archiveRelatedTopics, setArchiveRelatedTopics] = usePreference('assistant.archive.related_topics')
  const [deleteChildren, setDeleteChildren] = useState(false)
  const { runConfirm, handleOpenChange } = useDeletionConfirmGuard(open, pending, onOpenChange, () =>
    setDeleteChildren(false)
  )
  const permanent = mode === 'permanent'
  const displayName = name?.trim() || t('common.unnamed')
  // Permanent cascades stay unchecked and unsaved. Only assistant archive
  // reuses the remembered related-topics choice.
  const shouldDeleteChildren = !permanent ? archiveRelatedTopics : deleteChildren
  const checkboxLabel = t(
    permanent ? 'conversation_owner.delete_permanently.related_topics' : 'conversation_owner.archive.related_topics'
  )
  const childrenHint = permanent
    ? t(
        shouldDeleteChildren
          ? 'conversation_owner.delete_permanently.topics_deleted'
          : 'conversation_owner.delete_permanently.topics_kept'
      )
    : null

  return (
    <ConfirmDialog
      open={open}
      title={
        permanent
          ? t('conversation_owner.delete_permanently.assistant_title', { name: displayName })
          : t('common.archive')
      }
      description={permanent ? t('conversation_owner.delete_permanently.assistant_scope') : undefined}
      confirmText={permanent ? t('common.delete_permanently') : t('common.archive')}
      cancelText={t('common.cancel')}
      destructive={permanent}
      cancelDisabled={pending}
      confirmLoading={pending}
      confirmDisabled={pending}
      onOpenChange={handleOpenChange}
      onConfirm={() => runConfirm(() => onConfirm(shouldDeleteChildren))}
      content={
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              checked={shouldDeleteChildren}
              disabled={pending}
              onCheckedChange={(checked) => {
                const next = checked === true
                if (permanent) {
                  setDeleteChildren(next)
                  return
                }
                void setArchiveRelatedTopics(next).catch((error) => {
                  toast.error({ title: t('common.error'), description: formatErrorMessage(error) })
                })
              }}
            />
            <Label htmlFor={checkboxId}>{checkboxLabel}</Label>
          </div>
          {childrenHint && <p className="pl-6 text-muted-foreground text-xs">{childrenHint}</p>}
        </div>
      }
    />
  )
}

export interface PermanentConversationDeleteDialogProps {
  target: 'topic'
  name: string
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
}

export function PermanentConversationDeleteDialog({
  name,
  open,
  pending,
  onOpenChange,
  onConfirm
}: PermanentConversationDeleteDialogProps) {
  const { t } = useTranslation()
  const { runConfirm, handleOpenChange } = useDeletionConfirmGuard(open, pending, onOpenChange)
  const displayName = name.trim() || t('common.unnamed')

  return (
    <ConfirmDialog
      open={open}
      title={t('conversation.delete_permanently.title', { name: displayName })}
      description={t('conversation.delete_permanently.topic_scope')}
      content={
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">{t('conversation.delete_permanently.attachments')}</p>
        </div>
      }
      confirmText={t('common.delete_permanently')}
      cancelText={t('common.cancel')}
      destructive
      cancelDisabled={pending}
      confirmLoading={pending}
      confirmDisabled={pending}
      onOpenChange={handleOpenChange}
      onConfirm={() => runConfirm(() => onConfirm())}
    />
  )
}

export interface DeleteConversationOwnerPopupParams {
  type: 'assistant'
  action: (deleteChildren: boolean) => void | Promise<void>
}

function PopupContainer({
  open,
  resolve,
  type,
  action
}: DeleteConversationOwnerPopupParams & PopupInjectedProps<boolean>) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next && !pending) {
      resolve(false)
    }
  }

  const handleConfirm = async (deleteChildren: boolean) => {
    setPending(true)
    try {
      await action(deleteChildren)
    } catch (error) {
      toast.error({ title: t('common.error'), description: formatErrorMessage(error) })
      setPending(false)
      throw error
    }
    resolve(true)
  }

  return (
    <DeleteConversationOwnerConfirmDialog
      type={type}
      open={open}
      pending={pending}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
    />
  )
}

export const deleteConversationOwnerPopup = createPopup<DeleteConversationOwnerPopupParams, boolean>(PopupContainer, {
  dismissResult: false
})

export type PermanentDeletePopupParams =
  | {
      kind: 'conversation'
      target: 'topic'
      name: string
      action: () => void | Promise<void>
    }
  | {
      kind: 'owner'
      type: 'assistant'
      name: string
      action: (deleteChildren: boolean) => void | Promise<void>
    }

function PermanentDeletePopupContainer(props: PermanentDeletePopupParams & PopupInjectedProps<boolean>) {
  const { t } = useTranslation()
  const { open, resolve } = props
  const [pending, setPending] = useState(false)
  const submittingRef = useRef(false)

  const handleOpenChange = (next: boolean) => {
    if (!next && !pending && !submittingRef.current) {
      resolve(false)
    }
  }

  const runAction = async (action: () => Promise<void>) => {
    if (submittingRef.current) {
      throw new Error('Permanent delete confirmation is already submitting')
    }
    submittingRef.current = true
    setPending(true)
    try {
      await action()
    } catch (error) {
      toast.error({ title: t('common.error'), description: formatErrorMessage(error) })
      submittingRef.current = false
      setPending(false)
      throw error
    }
    resolve(true)
  }

  if (props.kind === 'conversation') {
    return (
      <PermanentConversationDeleteDialog
        target={props.target}
        name={props.name}
        open={open}
        pending={pending}
        onOpenChange={handleOpenChange}
        onConfirm={() => runAction(async () => props.action())}
      />
    )
  }

  return (
    <DeleteConversationOwnerConfirmDialog
      mode="permanent"
      type={props.type}
      name={props.name}
      open={open}
      pending={pending}
      onOpenChange={handleOpenChange}
      onConfirm={(deleteChildren) => runAction(async () => props.action(deleteChildren))}
    />
  )
}

export const permanentDeletePopup = createPopup<PermanentDeletePopupParams, boolean>(PermanentDeletePopupContainer, {
  dismissResult: false
})
