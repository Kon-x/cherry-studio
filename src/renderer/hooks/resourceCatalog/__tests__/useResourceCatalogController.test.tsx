import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dataApiService } from '@data/DataApiService'
import { ExportAssistantsDialog } from '@renderer/components/resourceCatalog/dialogs/export/ExportAssistantsDialog'
import { toast } from '@renderer/services/toast'
import type { ResourceItem } from '@renderer/types/resourceCatalog'
import { serializeAssistantsForExport } from '@renderer/utils/assistantTransfer'
import type { Assistant } from '@shared/data/types/assistant'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'
import type { UniqueModelId } from '@shared/data/types/model'

import { useResourceCatalogController } from '../useResourceCatalogController'

const controllerMocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  createAssistant: vi.fn(),
  createGroup: vi.fn(),
  closeConversationTabs: vi.fn(),
  duplicateAssistant: vi.fn(),
  groups: [] as Array<{
    id: string
    entityType: 'assistant'
    name: string
    orderKey: string
    createdAt: string
    updatedAt: string
  }>,
  groupsLoading: false,
  groupsError: undefined as Error | undefined,
  invalidate: vi.fn(),
  ipcRequest: vi.fn(),
  refetch: vi.fn(),
  resourceLibraryOptions: [] as unknown[],
  resourceLibraryState: {
    allResources: [] as ResourceItem[],
    error: undefined as Error | undefined,
    isLoading: false,
    resources: [] as ResourceItem[]
  },
  saveFile: vi.fn()
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      ({
        'assistants.presets.export.action': 'Export',
        'assistants.presets.export.title': 'Export Assistants',
        'assistants.presets.export.deselect_all': 'Deselect All',
        'common.selectedItems': `Selected ${values?.count} items`
      })[key] ?? key
  })
}))

vi.mock('@cherrystudio/ui', async (importOriginal) => importOriginal())

vi.mock('../useResourceLibrary', () => ({
  useResourceLibrary: (options: unknown) => {
    controllerMocks.resourceLibraryOptions.push(options)
    return {
      allResources: controllerMocks.resourceLibraryState.allResources,
      error: controllerMocks.resourceLibraryState.error,
      isLoading: controllerMocks.resourceLibraryState.isLoading,
      isRefreshing: false,
      refetch: controllerMocks.refetch,
      resources: controllerMocks.resourceLibraryState.resources
    }
  }
}))

vi.mock('@renderer/hooks/useAssistant', () => ({
  useAssistantMutations: () => ({
    createAssistant: controllerMocks.createAssistant
  })
}))

vi.mock('../assistantAdapter', () => ({
  useDuplicateAssistantMutation: () => ({
    duplicateAssistant: controllerMocks.duplicateAssistant
  })
}))

vi.mock('@renderer/hooks/useGroups', () => ({
  useGroups: () => ({
    groups: controllerMocks.groups,
    isLoading: controllerMocks.groupsLoading,
    error: controllerMocks.groupsError
  }),
  useGroupMutations: () => ({ createGroup: controllerMocks.createGroup })
}))

const dataApiGet = vi.mocked(dataApiService.get)

function exportAssistant(id: string, overrides: Partial<Assistant> = {}): Assistant {
  return {
    id,
    name: id,
    description: '',
    prompt: 'Role',
    emoji: '🤖',
    groupId: null,
    modelId: 'openai::gpt',
    modelName: null,
    orderKey: 'a0',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    mcpServerIds: [],
    knowledgeBaseIds: [],
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}

const createValues = {
  agentType: 'claude-code' as const,
  permissionMode: 'auto' as const,
  avatar: 'A',
  description: 'A focused helper',
  knowledgeBaseIds: ['kb-1'],
  modelId: 'provider:model' as UniqueModelId,
  name: 'New resource',
  prompt: 'Stay focused',
  skillIds: ['skill-1']
}

const assistantResource = {
  id: 'assistant-to-duplicate',
  type: 'assistant',
  name: 'Assistant to duplicate',
  description: '',
  avatar: 'A',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  raw: { id: 'assistant-to-duplicate', name: 'Assistant to duplicate', groupId: null }
} as unknown as ResourceItem

describe('useResourceCatalogController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    controllerMocks.createAssistant.mockResolvedValue({ id: 'assistant-created' })
    controllerMocks.createAgent.mockResolvedValue({ id: 'agent-created' })
    dataApiGet.mockReset().mockResolvedValue([])
    controllerMocks.invalidate.mockResolvedValue(undefined)
    controllerMocks.ipcRequest.mockImplementation((route: string) => {
      if (route === 'ai.agent.sessions.delete') return Promise.resolve({ deletedIds: ['session-1', 'session-2'] })
      if (route === 'ai.agent.session.restore') return Promise.resolve(undefined)
      return Promise.reject(new Error(`Unexpected IPC route: ${route}`))
    })
    controllerMocks.refetch.mockResolvedValue(undefined)
    controllerMocks.resourceLibraryOptions.length = 0
    controllerMocks.groups.length = 0
    controllerMocks.groupsLoading = false
    controllerMocks.groupsError = undefined
    controllerMocks.resourceLibraryState.allResources = []
    controllerMocks.resourceLibraryState.error = undefined
    controllerMocks.resourceLibraryState.isLoading = false
    controllerMocks.resourceLibraryState.resources = []
    controllerMocks.saveFile.mockReset().mockResolvedValue('/tmp/assistant.json')
    Object.assign(window, {
      api: {
        ...window.api,
        file: {
          ...window.api.file,
          save: controllerMocks.saveFile
        }
      }
    })
  })

  it('loads every assistant page independently of catalog filters and saves selected IDs in fetched order', async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => exportAssistant(`assistant-${i}`))
    const last = exportAssistant('last')
    dataApiGet
      .mockResolvedValueOnce({ items: firstPage, total: 501 })
      .mockResolvedValueOnce({ items: [last], total: 501 })
      .mockResolvedValue([])
    const { result } = renderHook(() => useResourceCatalogController('assistant'))
    act(() => {
      result.current.gridProps.onSearchChange('unrelated catalog filter')
      result.current.gridProps.onGroupFilter('unrelated group')
      result.current.gridProps.onExportAssistants()
    })
    await waitFor(() => expect(result.current.dialogs.exportAssistants).toHaveLength(501))
    expect(result.current.dialogs.assistantExportLoading).toBe(false)
    expect(dataApiGet).toHaveBeenNthCalledWith(1, '/assistants', { query: { page: 1, limit: 500 } })
    expect(dataApiGet).toHaveBeenNthCalledWith(2, '/assistants', { query: { page: 2, limit: 500 } })
    await act(async () => result.current.dialogs.handleExportAssistants(['last', 'assistant-0']))
    const records = JSON.parse(new TextDecoder().decode(controllerMocks.saveFile.mock.calls[0][1]))
    expect(records.map((record: { name: string }) => record.name)).toEqual(['assistant-0', 'last'])
    expect(dataApiGet.mock.calls.slice(2).map(([path]) => path)).toEqual([
      '/prompt-bindings/assistant/assistant-0',
      '/prompt-bindings/assistant/last'
    ])
    expect(result.current.dialogs.assistantExportOpen).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('common.success')
  })

  it('defaults all 501 assistants only after the second page finishes and disables confirmation after Deselect All', async () => {
    const user = userEvent.setup()
    const secondPage = deferred<{ items: Assistant[]; total: number }>()
    dataApiGet
      .mockResolvedValueOnce({
        items: Array.from({ length: 500 }, (_, i) => exportAssistant(`row-${i}`)),
        total: 501
      })
      .mockReturnValueOnce(secondPage.promise)
    function ExportHarness() {
      const { gridProps, dialogs } = useResourceCatalogController('assistant')
      return (
        <>
          <button type="button" onClick={gridProps.onExportAssistants}>
            Open export
          </button>
          <ExportAssistantsDialog
            open={dialogs.assistantExportOpen}
            onOpenChange={dialogs.handleAssistantExportOpenChange}
            assistants={dialogs.exportAssistants}
            loading={dialogs.assistantExportLoading}
            exporting={dialogs.assistantExporting}
            onExport={dialogs.handleExportAssistants}
          />
        </>
      )
    }
    render(<ExportHarness />)
    await user.click(screen.getByRole('button', { name: 'Open export' }))
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await act(async () => secondPage.resolve({ items: [exportAssistant('row-500')], total: 501 }))
    expect(await screen.findByText('Selected 501 items')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'row-500' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Deselect All' }))
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(controllerMocks.saveFile).not.toHaveBeenCalled()
  })

  it('ignores a previous opening that completes after a fresh list is available', async () => {
    const old = deferred<{ items: Assistant[]; total: number }>()
    dataApiGet.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [exportAssistant('fresh')], total: 1 })
    const { result } = renderHook(() => useResourceCatalogController('assistant'))
    act(() => result.current.gridProps.onExportAssistants())
    act(() => result.current.dialogs.handleAssistantExportOpenChange(false))
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.exportAssistants.map(({ id }) => id)).toEqual(['fresh']))
    await act(async () => old.resolve({ items: [exportAssistant('stale')], total: 1 }))
    expect(result.current.dialogs.exportAssistants.map(({ id }) => id)).toEqual(['fresh'])
    expect(result.current.dialogs.assistantExportLoading).toBe(false)
  })

  it('does not save stale prompt reads or close a later opening after an old Save completes', async () => {
    const prompts = deferred<[]>()
    dataApiGet.mockResolvedValueOnce({ items: [exportAssistant('old')], total: 1 })
    const { result } = renderHook(() => useResourceCatalogController('assistant'))
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.assistantExportLoading).toBe(false))
    dataApiGet.mockReturnValueOnce(prompts.promise)
    let pendingExport!: Promise<void>
    act(() => {
      pendingExport = result.current.dialogs.handleExportAssistants(['old'])
    })
    act(() => result.current.dialogs.handleAssistantExportOpenChange(false))
    dataApiGet.mockResolvedValueOnce({ items: [exportAssistant('fresh')], total: 1 })
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.exportAssistants[0]?.id).toBe('fresh'))
    await act(async () => {
      prompts.resolve([])
      await pendingExport
    })
    expect(controllerMocks.saveFile).not.toHaveBeenCalled()

    const save = deferred<string | null>()
    controllerMocks.saveFile.mockReturnValueOnce(save.promise)
    act(() => {
      pendingExport = result.current.dialogs.handleExportAssistants(['fresh'])
    })
    await waitFor(() => expect(controllerMocks.saveFile).toHaveBeenCalledOnce())
    act(() => result.current.dialogs.handleAssistantExportOpenChange(false))
    dataApiGet.mockResolvedValueOnce({ items: [exportAssistant('later')], total: 1 })
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.exportAssistants[0]?.id).toBe('later'))
    await act(async () => {
      save.resolve('old-assistants.json')
      await pendingExport
    })
    expect(result.current.dialogs.assistantExportOpen).toBe(true)
    expect(result.current.dialogs.assistantExporting).toBe(false)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it.each(['page', 'group', 'missing group', 'prompt'])(
    'aborts the entire batch on %s read failure',
    async (failure) => {
      if (failure === 'page') dataApiGet.mockRejectedValueOnce(new Error('read failed'))
      else
        dataApiGet.mockResolvedValueOnce({
          items: [exportAssistant('selected', { groupId: failure === 'missing group' ? 'missing' : null })],
          total: 1
        })
      if (failure === 'group') controllerMocks.groupsError = new Error('group read failed')
      const { result } = renderHook(() => useResourceCatalogController('assistant'))
      act(() => result.current.gridProps.onExportAssistants())
      await waitFor(() => expect(result.current.dialogs.assistantExportLoading).toBe(false))
      if (failure === 'prompt') dataApiGet.mockRejectedValueOnce(new Error('prompt read failed'))
      await act(async () => result.current.dialogs.handleExportAssistants(['selected']))
      expect(controllerMocks.saveFile).not.toHaveBeenCalled()
      expect(result.current.dialogs.assistantExportOpen).toBe(true)
      expect(toast.error).toHaveBeenCalledWith('library.export_assistants_failed')
      expect(toast.success).not.toHaveBeenCalled()
    }
  )

  it('waits for groups and preserves resolved names and binding order in the saved array', async () => {
    controllerMocks.groupsLoading = true
    dataApiGet.mockResolvedValueOnce({ items: [exportAssistant('grouped', { groupId: 'work' })], total: 1 })
    const { result, rerender } = renderHook(() => useResourceCatalogController('assistant'))
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.exportAssistants).toHaveLength(1))
    expect(result.current.dialogs.assistantExportLoading).toBe(true)
    await act(async () => result.current.dialogs.handleExportAssistants(['grouped']))
    expect(controllerMocks.saveFile).not.toHaveBeenCalled()
    controllerMocks.groupsLoading = false
    controllerMocks.groups = [
      { id: 'work', entityType: 'assistant', name: 'Work', orderKey: 'a0', createdAt: '', updatedAt: '' }
    ]
    rerender()
    dataApiGet.mockResolvedValueOnce([
      { id: 'z', title: 'Z', content: 'First', createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z' },
      { id: 'a', title: 'A', content: 'Second', createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z' }
    ])
    await act(async () => result.current.dialogs.handleExportAssistants(['grouped']))
    expect(JSON.parse(new TextDecoder().decode(controllerMocks.saveFile.mock.calls[0][1]))).toMatchObject([
      {
        group: ['Work'],
        regularPhrases: [
          { title: 'Z', content: 'First', order: 0 },
          { title: 'A', content: 'Second', order: 1 }
        ]
      }
    ])
  })

  it('retains the open batch after cancellation or rejection and allows retry', async () => {
    dataApiGet.mockResolvedValueOnce({ items: [exportAssistant('selected')], total: 1 })
    controllerMocks.saveFile
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce('save failed')
      .mockResolvedValueOnce('assistants.json')
    const { result } = renderHook(() => useResourceCatalogController('assistant'))
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.assistantExportLoading).toBe(false))
    await act(async () => result.current.dialogs.handleExportAssistants(['selected']))
    expect(result.current.dialogs.assistantExportOpen).toBe(true)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    await act(async () => result.current.dialogs.handleExportAssistants(['selected']))
    expect(result.current.dialogs.assistantExportOpen).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('library.export_assistants_failed')
    await act(async () => result.current.dialogs.handleExportAssistants(['selected']))
    expect(result.current.dialogs.assistantExportOpen).toBe(false)
    expect(controllerMocks.saveFile.mock.calls.map(([name]) => name)).toEqual([
      'assistants.json',
      'assistants.json',
      'assistants.json'
    ])
  })

  it.each([0, 1])('allows exactly 5 MiB of UTF-8 and rejects one byte more (%s)', async (extra) => {
    const assistant = exportAssistant('large', { prompt: '界' })
    const overhead = new TextEncoder().encode(serializeAssistantsForExport([{ assistant, prompts: [] }])).byteLength
    assistant.prompt += 'a'.repeat(5_242_880 - overhead + extra)
    dataApiGet.mockResolvedValueOnce({ items: [assistant], total: 1 })
    const { result } = renderHook(() => useResourceCatalogController('assistant'))
    act(() => result.current.gridProps.onExportAssistants())
    await waitFor(() => expect(result.current.dialogs.assistantExportLoading).toBe(false))
    await act(async () => result.current.dialogs.handleExportAssistants(['large']))
    if (extra) {
      expect(controllerMocks.saveFile).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('library.import_dialog.error.file_too_large')
      expect(result.current.dialogs.assistantExportOpen).toBe(true)
    } else {
      expect(controllerMocks.saveFile.mock.calls[0][1].byteLength).toBe(5_242_880)
      expect(result.current.dialogs.assistantExportOpen).toBe(false)
    }
  })

  it('creates an assistant and refetches the resource list', async () => {
    const { result } = renderHook(() => useResourceCatalogController('assistant'))

    act(() => {
      result.current.gridProps.onCreate('assistant')
    })

    await act(async () => {
      await result.current.dialogs.handleSubmitCreateResource(createValues)
    })

    expect(controllerMocks.createAssistant).toHaveBeenCalledWith({
      description: createValues.description,
      emoji: createValues.avatar,
      knowledgeBaseIds: createValues.knowledgeBaseIds,
      modelId: createValues.modelId,
      name: createValues.name,
      prompt: createValues.prompt
    })
    expect(controllerMocks.refetch).toHaveBeenCalledOnce()
    expect(result.current.dialogs.createDialogOpen).toBe(false)
  })

  it('reports assistant duplicate failures without refetching', async () => {
    controllerMocks.duplicateAssistant.mockRejectedValueOnce(new Error('duplicate failed'))
    const { result } = renderHook(() => useResourceCatalogController('assistant'))

    await act(async () => {
      await result.current.gridProps.onDuplicate(assistantResource)
    })

    expect(toast.error).toHaveBeenCalledWith('duplicate failed')
    expect(controllerMocks.refetch).not.toHaveBeenCalled()
  })

  it('stores only the resource key when opening the edit dialog', () => {
    controllerMocks.resourceLibraryState.resources = [assistantResource]
    const { result } = renderHook(() => useResourceCatalogController('assistant'))

    act(() => {
      result.current.gridProps.onEdit(assistantResource)
    })

    expect(result.current.dialogs.editDialogTarget).toEqual({
      kind: 'assistant',
      id: 'assistant-to-duplicate'
    })
  })

  it('reports assistant export failures without throwing', async () => {
    controllerMocks.saveFile.mockRejectedValueOnce(new Error('export failed'))
    const { result } = renderHook(() => useResourceCatalogController('assistant'))

    act(() => {
      result.current.gridProps.onExport(assistantResource)
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('export failed')
    })
  })

  it('counts non-empty groups and resolves the exported assistant group name', async () => {
    dataApiGet.mockResolvedValueOnce([
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Context prompt',
        content: 'Context body',
        visibility: 'restricted',
        orderKey: 'a0',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      }
    ])
    controllerMocks.groups.push(
      {
        id: 'group-work',
        entityType: 'assistant',
        name: 'Work',
        orderKey: 'a0',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 'group-empty',
        entityType: 'assistant',
        name: 'Empty',
        orderKey: 'a1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    )
    const groupedAssistant = {
      ...assistantResource,
      groupId: 'group-work',
      raw: { ...assistantResource.raw, groupId: 'group-work' }
    } as ResourceItem
    controllerMocks.resourceLibraryState.allResources = [
      groupedAssistant,
      { ...groupedAssistant, id: 'assistant-2', raw: { ...groupedAssistant.raw, id: 'assistant-2' } } as ResourceItem
    ]

    const { result } = renderHook(() => useResourceCatalogController('assistant'))

    expect(result.current.gridProps.groups).toEqual([{ id: 'group-work', name: 'Work', count: 2 }])

    act(() => {
      result.current.gridProps.onExport(groupedAssistant)
    })

    await waitFor(() => expect(controllerMocks.saveFile).toHaveBeenCalledOnce())
    const exportedBytes = controllerMocks.saveFile.mock.calls[0][1] as Uint8Array
    expect(dataApiGet).toHaveBeenCalledWith('/prompt-bindings/assistant/assistant-to-duplicate')
    expect(JSON.parse(new TextDecoder().decode(exportedBytes))).toMatchObject([
      {
        group: ['Work'],
        regularPhrases: [{ title: 'Context prompt', content: 'Context body', order: 0 }]
      }
    ])
  })
})
