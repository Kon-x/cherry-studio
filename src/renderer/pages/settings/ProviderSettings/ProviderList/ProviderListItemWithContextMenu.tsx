import { CommandContextMenu, type CommandContextMenuExtraItem, CommandPopupMenu } from '@renderer/components/command'
import ModelNotesPopup from '@renderer/pages/settings/ProviderSettings/ModelNotesPopup'
import { providerListClasses } from '@renderer/pages/settings/ProviderSettings/primitives/ProviderSettingsPrimitives'
import { getFancyProviderName } from '@renderer/pages/settings/ProviderSettings/utils/providerDisplay'
import type { Provider } from '@shared/data/types/provider'
import { CopyPlus, Edit, Square, SquareCheckBig, Trash2, UserPen } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import ProviderListItem from '../components/ProviderListItem'

type ListDragState = { dragging: boolean }

interface ProviderListItemWithContextMenuProps {
  provider: Provider
  selected: boolean
  contextOpen: boolean
  onContextOpenChange: (open: boolean) => void
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate?: () => void
  showManagementActions: boolean
  listState: ListDragState
  onSetListItemRef: (providerId: string, element: HTMLDivElement | null) => void
  selectionMode?: boolean
  checked?: boolean
  onToggleChecked?: () => void
}

export default function ProviderListItemWithContextMenu({
  provider,
  selected,
  contextOpen,
  onContextOpenChange,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  showManagementActions,
  listState,
  onSetListItemRef,
  selectionMode = false,
  checked = false,
  onToggleChecked
}: ProviderListItemWithContextMenuProps) {
  const { t } = useTranslation()

  const menuItems = useMemo<readonly CommandContextMenuExtraItem[]>(() => {
    const items: CommandContextMenuExtraItem[] = []
    if (showManagementActions) {
      items.push({
        type: 'item',
        id: 'edit',
        label: t('common.edit'),
        icon: <Edit size={14} />,
        onSelect: onEdit
      })
    }
    if (onDuplicate) {
      items.push({
        type: 'item',
        id: 'duplicate',
        label: t('settings.provider.duplicate.menu_label'),
        icon: <CopyPlus size={14} />,
        onSelect: onDuplicate
      })
    }
    items.push({
      type: 'item',
      id: 'notes',
      label: t('settings.provider.notes.title'),
      icon: <UserPen size={14} />,
      onSelect: () => ModelNotesPopup.show({ providerId: provider.id })
    })
    items.push({
      type: 'item',
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onSelect: onDelete
    })
    return items
  }, [onDelete, onDuplicate, onEdit, provider.id, showManagementActions, t])

  // Selection mode: rows become plain checkable targets — no context menus, no drag affordance.
  if (selectionMode) {
    return (
      <div className="flex w-full items-center gap-1.5" ref={(element) => onSetListItemRef(provider.id, element)}>
        <span aria-hidden className="shrink-0 pl-1">
          {checked ? (
            <SquareCheckBig size={15} className="text-primary" />
          ) : (
            <Square size={15} className="text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <ProviderListItem
            provider={{ ...provider, name: getFancyProviderName(provider) }}
            selected={checked}
            dragging={false}
            onClick={() => onToggleChecked?.()}
          />
        </div>
      </div>
    )
  }

  // Right-click stays uncontrolled — Radix handles cross-popup mutex naturally.
  // The more-button popup remains controlled so the parent's single-row-active-at-a-time
  // tracking (`contextProviderId`) keeps working across clicks between rows.
  return (
    <CommandContextMenu location="webcontents.context" extraItems={menuItems}>
      <div className="w-full" ref={(element) => onSetListItemRef(provider.id, element)}>
        <ProviderListItem
          provider={{ ...provider, name: getFancyProviderName(provider) }}
          selected={selected}
          dragging={listState.dragging}
          onClick={onSelect}
          onOpenMenu={() => onContextOpenChange(true)}
          renderMenuButton={(button) => (
            <CommandPopupMenu
              location="webcontents.context"
              extraItems={menuItems}
              open={contextOpen}
              onOpenChange={onContextOpenChange}
              align="end"
              contentClassName={providerListClasses.itemMenuContent}>
              {button}
            </CommandPopupMenu>
          )}
        />
      </div>
    </CommandContextMenu>
  )
}
