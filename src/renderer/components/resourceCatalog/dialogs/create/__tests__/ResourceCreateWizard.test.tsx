import { act, cleanup, render, type RenderResult, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Activity, useState } from 'react'
import type * as ReactHookForm from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Model, UniqueModelId } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'

import type { ResourceCreateWizardFormValues, ResourceCreateWizardKind } from '../types'

const modelHook = vi.hoisted(() => ({
  defaultModel: undefined as Model | undefined,
  defaultProvider: { id: 'provider', name: 'Provider', isEnabled: true } as Provider | undefined
}))

function makeModel(id: UniqueModelId = 'provider::default'): Model {
  return {
    id,
    providerId: 'provider',
    apiModelId: id.split('::')[1],
    name: 'Default model',
    capabilities: [],
    supportsStreaming: true,
    isEnabled: true,
    isHidden: false
  }
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@renderer/hooks/useModel', () => ({
  useDefaultModel: () => ({ defaultModel: modelHook.defaultModel }),
  useModels: () => ({ models: modelHook.defaultModel?.isEnabled ? [modelHook.defaultModel] : [] })
}))

vi.mock('@renderer/hooks/useProvider', () => ({
  useProviderById: () => ({ provider: modelHook.defaultProvider })
}))

// Mock the step bodies so the wizard shell (navigation, validation gate, submit
// mapping) is exercised in isolation. BasicInfoStep fills the fields that gate
// the Next button; SystemPromptStep fills the prompt.
vi.mock('../steps/BasicInfoStep', async () => {
  const { useWatch } = await vi.importActual<typeof ReactHookForm>('react-hook-form')

  return {
    BasicInfoStep: ({ form }: { form: ReactHookForm.UseFormReturn<ResourceCreateWizardFormValues> }) => {
      const modelId = useWatch({ control: form.control, name: 'modelId' })
      const name = useWatch({ control: form.control, name: 'name' })

      return (
        <>
          <div data-testid="model-id">{modelId ?? 'empty'}</div>
          <div data-testid="name">{name || 'empty'}</div>
          <DraftValues form={form} />
          <input aria-label="draft name" {...form.register('name')} />
          <input aria-label="draft description" {...form.register('description')} />
          <button type="button" onClick={() => form.setValue('name', 'My Resource')}>
            fill name
          </button>
          <button
            type="button"
            onClick={() => {
              form.setValue('name', 'My Resource')
              form.setValue('modelId', 'provider::model')
            }}>
            fill basic
          </button>
        </>
      )
    }
  }
})
vi.mock('../steps/SystemPromptStep', () => ({
  SystemPromptStep: ({ form }: { form: ReactHookForm.UseFormReturn<ResourceCreateWizardFormValues> }) => (
    <>
      <textarea aria-label="draft prompt" {...form.register('prompt')} />
      <button type="button" onClick={() => form.setValue('prompt', 'be helpful')}>
        fill system prompt
      </button>
    </>
  )
}))
vi.mock('../steps/KnowledgeStep', () => ({
  KnowledgeStep: ({ form }: { form: ReactHookForm.UseFormReturn<ResourceCreateWizardFormValues> }) => (
    <div data-testid="knowledge-step">
      <DraftValues form={form} />
      <button type="button" onClick={() => form.setValue('knowledgeBaseIds', ['knowledge-draft'])}>
        select knowledge base
      </button>
    </div>
  )
}))

import { ResourceCreateWizard } from '../ResourceCreateWizard'

const NEXT = 'library.config.dialogs.create.next'
const CREATE = 'library.config.dialogs.create.submit'
const CANCEL = 'common.cancel'

const BASIC = /library\.config\.dialogs\.create\.step\.basic$/
const KNOWLEDGE = /library\.config\.dialogs\.create\.step\.knowledge$/
const onSubmitSpy = vi.fn()
const draft = {
  name: '  Activity draft  ',
  description: '  Description preserved across tabs  ',
  prompt: `  DRAFT_START
${'Keep every instruction across tab switches.\n'.repeat(40)}DRAFT_END  `
}

function DraftValues({ form }: { form: ReactHookForm.UseFormReturn<ResourceCreateWizardFormValues> }) {
  const [name, description, prompt, knowledgeBaseIds] = useWatch({
    control: form.control,
    name: ['name', 'description', 'prompt', 'knowledgeBaseIds']
  })
  return (
    <>
      <div data-testid="draft-name">{name}</div>
      <div data-testid="draft-description">{description}</div>
      <div data-testid="draft-prompt">{prompt}</div>
      <div data-testid="knowledge-ids">{JSON.stringify(knowledgeBaseIds)}</div>
      <div data-testid="knowledge-count">{knowledgeBaseIds.length}</div>
    </>
  )
}

function ActivityHost({
  visible,
  kind,
  initialName
}: {
  visible: boolean
  kind: ResourceCreateWizardKind
  initialName?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen wizard
      </button>
      <Activity mode={visible ? 'visible' : 'hidden'}>
        <div aria-label="wizard-activity">
          <ResourceCreateWizard
            kind={kind}
            open={open}
            onOpenChange={setOpen}
            onSubmit={onSubmitSpy}
            initialName={initialName}
          />
        </div>
      </Activity>
    </>
  )
}

async function hideAndShow(
  rerender: RenderResult['rerender'],
  props: { kind: ResourceCreateWizardKind; initialName?: string }
) {
  await act(async () => rerender(<ActivityHost {...props} visible={false} />))
  await waitFor(() => expect(screen.getByLabelText('wizard-activity')).not.toBeVisible())
  await act(async () => rerender(<ActivityHost {...props} visible />))
  await waitFor(() => expect(screen.getByLabelText('wizard-activity')).toBeVisible())
}

async function fillDraftToKnowledge(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByRole('textbox', { name: 'draft name' }))
  await user.type(screen.getByRole('textbox', { name: 'draft name' }), draft.name)
  await user.type(screen.getByRole('textbox', { name: 'draft description' }), draft.description)
  await user.click(screen.getByRole('button', { name: NEXT }))
  await user.click(screen.getByRole('textbox', { name: 'draft prompt' }))
  await user.paste(draft.prompt)
  await user.click(screen.getByRole('button', { name: NEXT }))
  await user.click(screen.getByRole('button', { name: 'select knowledge base' }))
}

function expectDraft() {
  expect(screen.getByRole('button', { name: KNOWLEDGE })).toHaveAttribute('aria-current', 'step')
  expect(screen.getByTestId('draft-name').textContent).toBe(draft.name)
  expect(screen.getByTestId('draft-description').textContent).toBe(draft.description)
  expect(screen.getByTestId('draft-prompt').textContent).toBe(draft.prompt)
  expect(screen.getByTestId('knowledge-ids').textContent).toBe('["knowledge-draft"]')
  expect(screen.getByTestId('knowledge-count')).toHaveTextContent('1')
}

function expectDefaults(name = '') {
  expect(screen.getByRole('button', { name: BASIC })).toHaveAttribute('aria-current', 'step')
  expect(screen.getByRole('textbox', { name: 'draft name' })).toHaveValue(name)
  expect(screen.getByRole('textbox', { name: 'draft description' })).toHaveValue('')
  expect(screen.getByTestId('draft-prompt')).toBeEmptyDOMElement()
  expect(screen.getByTestId('knowledge-ids').textContent).toBe('[]')
  expect(screen.getByTestId('knowledge-count')).toHaveTextContent('0')
}

afterEach(() => {
  cleanup()
  onSubmitSpy.mockReset()
  modelHook.defaultModel = undefined
  modelHook.defaultProvider = { id: 'provider', name: 'Provider', isEnabled: true } as Provider
})

describe('ResourceCreateWizard', () => {
  it('keeps a catalog prompt and assistant settings when creating from template metadata', async () => {
    const user = userEvent.setup()
    modelHook.defaultModel = makeModel()
    const onSubmit = vi.fn()
    render(
      <ResourceCreateWizard
        kind="assistant"
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        initialValues={{
          name: 'Product manager',
          avatar: '👨‍💼',
          description: 'Plan products',
          prompt: 'Keep this prompt\n{{language}}'
        }}
      />
    )
    await waitFor(() => expect(screen.getByRole('button', { name: NEXT })).toBeEnabled())
    for (let step = 0; step < 2; step++) await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: CREATE }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Product manager',
      avatar: '👨‍💼',
      description: 'Plan products',
      prompt: 'Keep this prompt\n{{language}}',
      modelId: 'provider::default',
      knowledgeBaseIds: []
    })
  })

  it.each(['assistant'] as const)(
    'keeps the draft and the current step after <Activity> hide/show (%s kind)',
    async (kind) => {
      const user = userEvent.setup()
      modelHook.defaultModel = makeModel()
      const { rerender } = render(<ActivityHost kind={kind} visible />)
      await fillDraftToKnowledge(user)
      expectDraft()

      await hideAndShow(rerender, { kind })

      expectDraft()
      await user.click(screen.getByRole('button', { name: CREATE }))
      expect(onSubmitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Activity draft',
          description: 'Description preserved across tabs',
          prompt: draft.prompt.trim(),
          knowledgeBaseIds: ['knowledge-draft']
        })
      )
    }
  )

  it.each(['assistant'] as const)(
    'reinitialises the wizard on a committed close and reopen of the same instance (%s kind)',
    async (kind) => {
      const user = userEvent.setup()
      modelHook.defaultModel = makeModel()
      const { rerender } = render(<ActivityHost kind={kind} visible />)
      await fillDraftToKnowledge(user)
      await hideAndShow(rerender, { kind })
      expectDraft()

      await user.click(screen.getByRole('button', { name: CANCEL }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: 'reopen wizard' }))

      expectDefaults()
    }
  )

  it('keeps the draft when initialName changes while open and uses the newest seed on the next open', async () => {
    const user = userEvent.setup()
    modelHook.defaultModel = makeModel()
    const { rerender } = render(<ActivityHost kind="assistant" initialName="First seed" visible />)
    expectDefaults('First seed')
    await fillDraftToKnowledge(user)
    await hideAndShow(rerender, { kind: 'assistant', initialName: 'First seed' })
    expectDraft()

    rerender(<ActivityHost kind="assistant" initialName="Newest seed" visible />)

    expectDraft()
    await user.click(screen.getByRole('button', { name: CANCEL }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'reopen wizard' }))
    expectDefaults('Newest seed')
  })

  it.each(['assistant'] as const)('labels the shared authoring step as System Prompt for %s', (kind) => {
    render(<ResourceCreateWizard kind={kind} open onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    expect(screen.getByText('library.config.prompt.label')).toBeInTheDocument()
    expect(screen.queryByText('library.config.dialogs.create.step.persona')).not.toBeInTheDocument()
  })

  it('prefills the model from the default model when the wizard opens', async () => {
    modelHook.defaultModel = makeModel()

    render(<ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    expect(await screen.findByTestId('model-id')).toHaveTextContent('provider::default')
  })

  it('does not prefill a disabled default model', async () => {
    modelHook.defaultModel = { ...makeModel(), isEnabled: false }

    render(<ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    expect(await screen.findByTestId('model-id')).toHaveTextContent('empty')
  })

  it('submits the default model when the user does not choose another model', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    modelHook.defaultModel = makeModel()
    render(<ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    expect(await screen.findByTestId('model-id')).toHaveTextContent('provider::default')
    await user.click(screen.getByRole('button', { name: 'fill name' }))
    expect(screen.getByRole('button', { name: NEXT })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: CREATE }))

    expect(onSubmit).toHaveBeenCalledWith({
      avatar: '💬',
      name: 'My Resource',
      modelId: 'provider::default',
      description: '',
      prompt: '',
      knowledgeBaseIds: []
    })
  })

  it('seeds the name from initialName so a caller-supplied name clears the first step', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    modelHook.defaultModel = makeModel()

    render(
      <ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={onSubmit} initialName="测试助手" />
    )

    expect(await screen.findByTestId('name')).toHaveTextContent('测试助手')
    // Name + default model are both set, so the first step is already cleared.
    expect(screen.getByRole('button', { name: NEXT })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: CREATE }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: '测试助手' }))
  })

  it('does not prefill a default model rejected by the wizard model filter', async () => {
    modelHook.defaultModel = makeModel()

    render(
      <ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={vi.fn()} modelFilter={() => false} />
    )

    expect(await screen.findByTestId('model-id')).toHaveTextContent('empty')
  })

  it('gates Next on a valid name + model, then walks assistant steps to a mapped submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    // Step 1: Next is blocked until name + model are set.
    expect(screen.getByRole('button', { name: NEXT })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'fill basic' }))
    expect(screen.getByRole('button', { name: NEXT })).toBeEnabled()

    // Step 1 → 2 (System Prompt)
    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: 'fill system prompt' }))

    // Step 2 → 3 (assistant: knowledge)
    await user.click(screen.getByRole('button', { name: NEXT }))
    expect(screen.getByTestId('knowledge-step')).toBeInTheDocument()

    // Final create → mapped payload
    await user.click(screen.getByRole('button', { name: CREATE }))
    expect(onSubmit).toHaveBeenCalledWith({
      avatar: '💬',
      name: 'My Resource',
      modelId: 'provider::model',
      description: '',
      prompt: 'be helpful',
      knowledgeBaseIds: []
    })
  })

  it('surfaces the actionable submit error and leaves the dialog closable after failure', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue(new Error('Selected knowledge base no longer exists'))

    render(<ResourceCreateWizard kind="assistant" open onOpenChange={onOpenChange} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'fill basic' }))
    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: NEXT }))
    await user.click(screen.getByRole('button', { name: CREATE }))

    expect(await screen.findByText('Selected knowledge base no longer exists')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'library.config.dialogs.create.assistant_title' })).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: CANCEL }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not prefill a default model when its provider is disabled', async () => {
    modelHook.defaultModel = makeModel()
    modelHook.defaultProvider = { id: 'provider', name: 'Provider', isEnabled: false } as Provider

    render(<ResourceCreateWizard kind="assistant" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    expect(await screen.findByTestId('model-id')).toHaveTextContent('empty')
  })
})
