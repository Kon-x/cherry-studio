import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { dataApiService } from '@data/DataApiService'
import { resolveTemplate } from '@renderer/data/utils/dataApiPath'
import { useAssistantMutations } from '@renderer/hooks/useAssistant'
import { useGroupMutations, useGroups } from '@renderer/hooks/useGroups'
import { toast } from '@renderer/services/toast'
import type {
  GroupItem,
  ResourceCreateValues,
  ResourceEditDialogTarget,
  ResourceItem,
  ResourceType
} from '@renderer/types/resourceCatalog'
import { serializeAssistantForExport, serializeAssistantsForExport } from '@renderer/utils/assistantTransfer'
import { buildCreateAssistantDto } from '@renderer/utils/resourceCatalog'
import type { ConcreteApiPaths } from '@shared/data/api/paths'
import { ASSISTANTS_MAX_LIMIT } from '@shared/data/api/schemas/assistants'
import type { Assistant } from '@shared/data/types/assistant'
import type { Group } from '@shared/data/types/group'

import { useDuplicateAssistantMutation } from './assistantAdapter'
import { useResourceLibrary } from './useResourceLibrary'

type ResourceCreateWizardKind = 'assistant'
type ResourceCatalogControllerType = Extract<ResourceType, 'assistant'>

const CREATE_DIALOG_EXIT_ANIMATION_MS = 200

/**
 * Build the top-bar chip list.
 *
 * Source: canonical assistant groups plus the unfiltered assistant list. Groups
 * with no assistants stay hidden until the user expands the toolbar.
 */
function buildGroups(resources: ResourceItem[], groups: Group[], filterType?: ResourceType): GroupItem[] {
  const counts = new Map<string, number>()
  const list = filterType ? resources.filter((r) => r.type === filterType) : resources
  for (const resource of list) {
    if (resource.type === 'assistant' && resource.groupId) {
      counts.set(resource.groupId, (counts.get(resource.groupId) ?? 0) + 1)
    }
  }

  return groups.flatMap((group) => {
    const count = counts.get(group.id)
    return count ? [{ id: group.id, name: group.name, count }] : []
  })
}

export function useResourceCatalogController(resourceType: ResourceCatalogControllerType) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ResourceItem | null>(null)
  const [createDialogKind, setCreateDialogKind] = useState<ResourceCreateWizardKind | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogTarget, setEditDialogTarget] = useState<ResourceEditDialogTarget | null>(null)
  const [creatingResource, setCreatingResource] = useState(false)
  const [assistantImportOpen, setAssistantImportOpen] = useState(false)
  const [assistantExportOpen, setAssistantExportOpen] = useState(false)
  const [exportAssistants, setExportAssistants] = useState<Assistant[]>([])
  const [assistantExportLoading, setAssistantExportLoading] = useState(false)
  const [assistantExportComplete, setAssistantExportComplete] = useState(false)
  const [assistantExporting, setAssistantExporting] = useState(false)
  const assistantExportEpoch = useRef(0)
  const assistantExportBusy = useRef(false)
  const [assistantLibraryOpen, setAssistantLibraryOpen] = useState(false)
  const isAssistantLibrary = resourceType === 'assistant'

  const {
    resources,
    allResources,
    isLoading,
    error: resourceError,
    refetch
  } = useResourceLibrary({
    resourceType,
    activeGroupId: isAssistantLibrary ? activeGroupId : null,
    search,
    sort: 'name'
  })

  useEffect(() => {
    setActiveGroupId(null)
  }, [resourceType])

  const { createAssistant } = useAssistantMutations()
  const { duplicateAssistant } = useDuplicateAssistantMutation()
  const { groups, isLoading: groupsLoading, error: groupsError } = useGroups('assistant')
  const { createGroup } = useGroupMutations('assistant')
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group] as const)), [groups])

  const scopedGroups = useMemo(() => {
    if (!isAssistantLibrary) return []
    return buildGroups(allResources, groups, 'assistant')
  }, [allResources, groups, isAssistantLibrary])

  useEffect(() => {
    if (createDialogOpen || !createDialogKind) return

    const timeoutId = window.setTimeout(() => setCreateDialogKind(null), CREATE_DIALOG_EXIT_ANIMATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [createDialogKind, createDialogOpen])

  const handleOpenResource = useCallback((resource: ResourceItem) => {
    if (resource.type === 'assistant') {
      setEditDialogTarget({ kind: 'assistant', id: resource.id })
    }
  }, [])

  const handleDuplicate = useCallback(
    async (resource: ResourceItem) => {
      if (resource.type === 'assistant') {
        try {
          await duplicateAssistant(resource.raw)
          refetch()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('library.duplicate_assistant_failed'))
        }
      }
    },
    [duplicateAssistant, refetch, t]
  )

  const handleExport = useCallback(
    async (resource: ResourceItem) => {
      if (resource.type !== 'assistant') return

      const assistant = resource.raw
      try {
        const groupName = assistant.groupId ? groupById.get(assistant.groupId)?.name : undefined
        const bindingPath = resolveTemplate('/prompt-bindings/:targetType/:targetId', {
          targetType: 'assistant',
          targetId: assistant.id
        }) as ConcreteApiPaths
        const contextualPrompts = await dataApiService.get(bindingPath)
        const content = serializeAssistantForExport(assistant, contextualPrompts, groupName)

        await window.api.file.save(`${assistant.name}.json`, new TextEncoder().encode(content), {
          filters: [{ name: t('assistants.presets.import.file_filter'), extensions: ['json'] }]
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('library.export_assistant_failed'))
      }
    },
    [groupById, t]
  )

  useEffect(
    () => () => {
      assistantExportEpoch.current += 1
    },
    []
  )

  const handleAssistantExportOpenChange = useCallback(
    (open: boolean) => {
      const epoch = ++assistantExportEpoch.current
      setAssistantExportOpen(open)
      setExportAssistants([])
      setAssistantExportComplete(false)
      setAssistantExportLoading(open)
      setAssistantExporting(false)
      assistantExportBusy.current = false
      if (!open) return

      void (async () => {
        try {
          const assistants: Assistant[] = []
          for (let page = 1; ; page += 1) {
            const result = await dataApiService.get('/assistants', { query: { page, limit: ASSISTANTS_MAX_LIMIT } })
            if (assistantExportEpoch.current !== epoch) return
            assistants.push(...result.items)
            if (assistants.length >= result.total) break
            if (result.items.length === 0) throw new Error('incomplete_assistant_list')
          }
          if (new Set(assistants.map(({ id }) => id)).size !== assistants.length) {
            throw new Error('inconsistent_assistant_list')
          }
          setExportAssistants(assistants)
          setAssistantExportComplete(true)
        } catch {
          if (assistantExportEpoch.current === epoch) toast.error(t('library.export_assistants_failed'))
        } finally {
          if (assistantExportEpoch.current === epoch) setAssistantExportLoading(false)
        }
      })()
    },
    [t]
  )

  const handleExportAssistants = useCallback(
    async (assistantIds: readonly string[]) => {
      if (!assistantExportOpen || assistantExportBusy.current || assistantExportLoading || !assistantExportComplete)
        return
      const epoch = assistantExportEpoch.current
      const selectedIds = new Set(assistantIds)
      const selected = exportAssistants.filter(({ id }) => selectedIds.has(id))
      if (selected.length === 0) return
      assistantExportBusy.current = true
      setAssistantExporting(true)
      try {
        if (groupsLoading || groupsError) throw new Error('assistant_groups_unavailable')
        const grouped = selected.map((assistant) => {
          const group = assistant.groupId === null ? undefined : groupById.get(assistant.groupId)
          if (assistant.groupId !== null && !group) throw new Error('assistant_group_unresolved')
          return { assistant, groupName: group?.name }
        })
        const entries = await Promise.all(
          grouped.map(async (entry) => {
            const path = resolveTemplate('/prompt-bindings/:targetType/:targetId', {
              targetType: 'assistant',
              targetId: entry.assistant.id
            }) as ConcreteApiPaths
            const prompts = await dataApiService.get(path)
            return { ...entry, prompts }
          })
        )
        if (assistantExportEpoch.current !== epoch) return
        const bytes = new TextEncoder().encode(serializeAssistantsForExport(entries))
        if (bytes.byteLength > 5_242_880) {
          toast.error(t('library.import_dialog.error.file_too_large'))
          return
        }
        const path = await window.api.file.save('assistants.json', bytes, {
          filters: [{ name: t('assistants.presets.import.file_filter'), extensions: ['json'] }]
        })
        if (assistantExportEpoch.current !== epoch || path === null) return
        handleAssistantExportOpenChange(false)
        toast.success(t('common.success'))
      } catch {
        if (assistantExportEpoch.current === epoch) toast.error(t('library.export_assistants_failed'))
      } finally {
        if (assistantExportEpoch.current === epoch) {
          assistantExportBusy.current = false
          setAssistantExporting(false)
        }
      }
    },
    [
      assistantExportComplete,
      assistantExportLoading,
      assistantExportOpen,
      exportAssistants,
      groupById,
      groupsError,
      groupsLoading,
      handleAssistantExportOpenChange,
      t
    ]
  )

  const handleCreate = useCallback((type: ResourceType) => {
    if (type === 'assistant') {
      setCreateDialogKind('assistant')
      setCreateDialogOpen(true)
    }
  }, [])

  const handleCreateDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && creatingResource) return
      setCreateDialogOpen(open)
    },
    [creatingResource]
  )

  const handleSubmitCreateResource = useCallback(
    async (values: ResourceCreateValues) => {
      const kind = createDialogKind
      if (!kind || creatingResource) return

      setCreatingResource(true)
      try {
        {
          await createAssistant(buildCreateAssistantDto(values))
        }

        setCreateDialogOpen(false)
        refetch()
      } finally {
        setCreatingResource(false)
      }
    },
    [createAssistant, createDialogKind, creatingResource, refetch]
  )

  return {
    resourceError,
    refetch,
    gridProps: {
      resources,
      isLoading,
      activeResourceType: resourceType,
      search,
      onSearchChange: setSearch,
      onEdit: handleOpenResource,
      onDuplicate: handleDuplicate,
      onDelete: setDeleteConfirm,
      onExport: (resource: ResourceItem) => {
        void handleExport(resource)
      },
      onCreate: handleCreate,
      onImportAssistant: () => setAssistantImportOpen(true),
      onExportAssistants: () => handleAssistantExportOpenChange(true),
      onOpenAssistantLibrary: isAssistantLibrary ? () => setAssistantLibraryOpen(true) : undefined,
      groups: scopedGroups,
      activeGroupId,
      onGroupFilter: setActiveGroupId,
      onAddGroup: async (groupName: string) => {
        await createGroup(groupName)
      },
      allGroups: groups
    },
    dialogs: {
      assistantImportOpen,
      assistantExportOpen,
      exportAssistants,
      assistantExportLoading: assistantExportLoading || groupsLoading,
      assistantExporting,
      handleAssistantExportOpenChange,
      handleExportAssistants,
      assistantLibraryOpen,
      createDialogKind,
      createDialogOpen,
      creatingResource,
      deleteConfirm,
      editDialogTarget,
      setAssistantImportOpen,
      setAssistantLibraryOpen,
      setDeleteConfirm,
      setEditDialogTarget,
      handleCreateDialogOpenChange,
      handleSubmitCreateResource
    }
  }
}
