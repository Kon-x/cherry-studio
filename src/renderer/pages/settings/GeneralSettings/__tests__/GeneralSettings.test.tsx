import userEvent from '@testing-library/user-event'
vi.mock('@renderer/components/cherryCloud/useCherryCloudModelSelectorData', () => ({
  useCherryCloudModelSelectorData: () => mockUseModelSelectorData()
}))
vi.mock('@renderer/components/cherryCloud/CherryCloudModelSelector', async () => {
  const selector = await import('@renderer/components/ModelSelector')
  return {
    CherryCloudModelSelector: selector.ModelSelector
  }
})

import { mockUsePreference, MockUsePreferenceUtils } from '@test-mocks/renderer/usePreference'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CherryStudioUi from '@cherrystudio/ui'
import type { UniqueModelId } from '@shared/data/types/model'

import GeneralSettings from '../GeneralSettings'

const mockUseModelSelectorData = vi.fn(() => ({
  resolvedSelectedModelIds: [] as UniqueModelId[],
  isLoading: false,
  modelsError: undefined as Error | undefined,
  providersError: undefined as Error | undefined,
  cloudAvailabilityReady: true,
  cloudAvailabilityError: undefined as Error | undefined
}))
const defaultPreferenceImplementation = mockUsePreference.getMockImplementation()!
const { ipcRequestMock, translationSpy } = vi.hoisted(() => ({ ipcRequestMock: vi.fn(), translationSpy: vi.fn() }))
const i18nMock = vi.hoisted(() => ({
  language: 'zh-CN',
  resolvedLanguage: 'zh-CN',
  changeLanguage: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@renderer/i18n/resolver', () => ({ default: i18nMock }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: { address?: string; route?: string }) => {
      translationSpy(key, options)
      const translations: Record<string, string> = {
        'settings.developer.cdp.title': 'Local automation (CDP)',
        'settings.developer.cdp.description': `Local tools can connect at ${options?.address}. Requires a restart.`,
        'settings.developer.cdp.port': 'CDP port',
        'settings.developer.cdp.invalid_port': 'Enter a whole-number port from 1 to 65534.',
        'settings.developer.enable_developer_mode': 'Developer mode'
      }
      if (key === 'settings.proxy.test.success' && options?.route === 'settings.proxy.test.route.fallback')
        return key + ': ' + options.route
      return translations[key] ?? key
    }
  })
}))

vi.mock('@renderer/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' })
}))

vi.mock('@renderer/hooks/useTimer', () => ({
  useTimer: () => ({ setTimeoutTimer: vi.fn() })
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: ipcRequestMock }
}))

vi.mock('@renderer/components/Selector', () => ({
  default: ({
    value,
    onChange,
    options
  }: {
    value: string | null
    onChange: (value: 'system' | 'custom' | 'none') => void
    options: Array<{ value: 'system' | 'custom' | 'none'; label: string }>
  }) => (
    <select
      aria-label="settings.proxy.mode.title"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value as 'system' | 'custom' | 'none')}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}))

vi.mock('@renderer/components/ModelSelector', async () => {
  const selection = await import('@renderer/components/ModelSelector/selection')
  return {
    ModelSelector: ({ trigger }: { trigger: ReactNode }) => trigger,
    countStaleSelectedModelIds: selection.countStaleSelectedModelIds,
    hasStaleSelectedModelIds: selection.hasStaleSelectedModelIds,
    useModelSelectorData: () => mockUseModelSelectorData()
  }
})

vi.mock('../ContextManagementSettings', () => ({
  ContextManagementSettings: () => (
    <section>
      <h2>settings.models.context_management.title</h2>
    </section>
  )
}))

vi.mock('@renderer/components/SettingsPrimitives', () => ({
  SettingDivider: () => <hr />,
  SettingDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SettingGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SettingRow: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="setting-row" {...props}>
      {children}
    </div>
  ),
  SettingRowTitle: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  SettingsContentColumn: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  SettingTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>
}))

vi.mock('@renderer/services/popup', () => ({
  popup: { confirm: vi.fn() }
}))

vi.mock('@renderer/services/toast', () => ({
  toast: { error: vi.fn() }
}))

vi.mock('@cherrystudio/ui', async (importOriginal) => {
  const { InputNumber, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } =
    await importOriginal<typeof CherryStudioUi>()
  return {
    Button: ({ children, loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
      <button type="button" data-loading={loading || undefined} {...props}>
        {children}
      </button>
    ),
    Flex: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    InfoTooltip: () => null,
    Combobox: ({
      options,
      value,
      onChange,
      'aria-label': ariaLabel
    }: {
      options: { value: string; label: string }[]
      value?: string | string[]
      onChange?: (value: string | string[]) => void
      'aria-label'?: string
    }) => (
      <select
        aria-label={ariaLabel}
        value={Array.isArray(value) ? (value[0] ?? '') : (value ?? '')}
        onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    InputNumber,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch: ({
      checked,
      onCheckedChange,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      checked?: boolean
      onCheckedChange?: (checked: boolean) => void
    }) => (
      <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)} {...props}>
        switch
      </button>
    )
  }
})

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    i18nMock.language = 'zh-CN'
    i18nMock.resolvedLanguage = 'zh-CN'
    mockUsePreference.mockImplementation(defaultPreferenceImplementation)
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: true,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.resetMocks()
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'BootConfig.app.remote_debugging.enabled': false,
      'BootConfig.app.remote_debugging.port': 9222,
      'app.developer_mode.enabled': false,
      'app.tray.enabled': true,
      'app.tray.on_close': true,
      'app.tray.on_launch': true,
      'feature.quick_assistant.click_tray_to_show': true
    })
    mockUseModelSelectorData.mockReset()
    ipcRequestMock.mockReset()
    ipcRequestMock.mockResolvedValue({
      target: 'https://www.gstatic.com/generate_204',
      route: 'proxy',
      success: true
    })
  })

  it('renders model retry settings in General and persists changes', async () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: ['openai::gpt-4o'],
      isLoading: false,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: true,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.max_attempts': 3,
      'chat.retry.backoff_enabled': true,
      'chat.retry.fallback_model_ids': ['openai::gpt-4o']
    })

    render(<GeneralSettings />)

    expect(screen.getByLabelText('settings.models.retry.max_attempts')).toHaveValue('3')
    expect(screen.getByLabelText('settings.models.retry.backoff')).toBeInTheDocument()
    expect(screen.getByText('settings.models.retry.fallback_models_count')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('settings.general.retry.enabled'))

    await waitFor(() => {
      expect(MockUsePreferenceUtils.getPreferenceValue('chat.retry.enabled')).toBe(false)
    })
  })

  it('marks persisted fallback model ids missing from the catalog as unavailable', () => {
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['openai::deleted-model']
    })

    render(<GeneralSettings />)

    const fallbackTrigger = screen.getByText('settings.models.retry.fallback_models_unavailable').closest('button')
    expect(fallbackTrigger).toBeInTheDocument()
    expect(fallbackTrigger).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not mark fallback models unavailable while the model catalog is still loading', () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: true,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: true,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['openai::deleted-model']
    })

    render(<GeneralSettings />)

    expect(screen.getByText('settings.models.retry.fallback_models_count')).toBeInTheDocument()
    expect(screen.queryByText('settings.models.retry.fallback_models_unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('settings.models.retry.fallback_models_count').closest('button')).not.toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('does not mark fallback models unavailable when the model catalog request failed', () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: new Error('network'),
      providersError: undefined,
      cloudAvailabilityReady: true,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['openai::deleted-model']
    })

    render(<GeneralSettings />)

    expect(screen.getByText('settings.models.retry.fallback_models_count')).toBeInTheDocument()
    expect(screen.queryByText('settings.models.retry.fallback_models_unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('settings.models.retry.fallback_models_count').closest('button')).not.toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('does not mark fallback models unavailable when the provider catalog request failed', () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: undefined,
      providersError: new Error('network'),
      cloudAvailabilityReady: true,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['openai::gpt-4o']
    })

    render(<GeneralSettings />)

    expect(screen.getByText('settings.models.retry.fallback_models_count')).toBeInTheDocument()
    expect(screen.queryByText('settings.models.retry.fallback_models_unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('settings.models.retry.fallback_models_count').closest('button')).not.toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('defers stale fallback classification while the Cherry Cloud availability snapshot is pending', () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: false,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['cherryai-subscription::managed-model']
    })

    render(<GeneralSettings />)

    expect(screen.getByText('settings.models.retry.fallback_models_count')).toBeInTheDocument()
    expect(screen.queryByText('settings.models.retry.fallback_models_unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('settings.models.retry.fallback_models_count').closest('button')).not.toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('defers stale fallback classification when the Cherry Cloud availability sync failed', () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: false,
      cloudAvailabilityError: new Error('sync failed')
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['cherryai-subscription::managed-model']
    })

    render(<GeneralSettings />)

    expect(screen.getByText('settings.models.retry.fallback_models_count')).toBeInTheDocument()
    expect(screen.queryByText('settings.models.retry.fallback_models_unavailable')).not.toBeInTheDocument()
  })

  it.each([
    { ready: false, error: undefined },
    { ready: false, error: new Error('sync failed') },
    { ready: true, error: new Error('refresh failed') }
  ])('still warns on known stale non-Cloud selections with Cloud state %j', ({ ready, error }) => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: ready,
      cloudAvailabilityError: error
    })
    const configuredIds: UniqueModelId[] = ['openai::deleted-model', 'openai::deleted-model']
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': configuredIds
    })

    render(<GeneralSettings />)

    expect(screen.getByText('settings.models.retry.fallback_models_unavailable').closest('button')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(translationSpy).toHaveBeenCalledWith('settings.models.retry.fallback_models_unavailable', { count: 1 })
    expect(MockUsePreferenceUtils.getPreferenceValue('chat.retry.fallback_model_ids')).toEqual(configuredIds)
  })

  it.each([false, true])(
    'keeps unknown Cloud IDs neutral alongside known stale IDs (resolved non-Cloud: %s)',
    (hasResolved) => {
      mockUseModelSelectorData.mockReturnValue({
        resolvedSelectedModelIds: hasResolved ? ['openai::available-model'] : [],
        isLoading: false,
        modelsError: undefined,
        providersError: undefined,
        cloudAvailabilityReady: false,
        cloudAvailabilityError: new Error('sync failed')
      })
      const configuredIds = [
        ...(hasResolved ? ['openai::available-model'] : []),
        'cherryai-subscription::managed::model',
        'cherryai-subscription::managed::model',
        'openai::deleted-model',
        'malformed-id',
        'malformed-id'
      ] as UniqueModelId[]
      MockUsePreferenceUtils.setMultiplePreferenceValues({
        'chat.retry.enabled': true,
        'chat.retry.fallback_model_ids': configuredIds
      })

      render(<GeneralSettings />)

      expect(
        screen.getByText('settings.models.retry.fallback_models_count_with_invalid').closest('button')
      ).toHaveAttribute('aria-invalid', 'true')
      expect(translationSpy).toHaveBeenCalledWith('settings.models.retry.fallback_models_count_with_invalid', {
        valid: hasResolved ? 2 : 1,
        invalid: 2
      })
      expect(screen.queryByText('settings.models.retry.fallback_models_unavailable')).not.toBeInTheDocument()
      expect(MockUsePreferenceUtils.getPreferenceValue('chat.retry.fallback_model_ids')).toEqual(configuredIds)
    }
  )

  it('marks configured Cherry Cloud fallback models unavailable once availability is ready', () => {
    mockUseModelSelectorData.mockReturnValue({
      resolvedSelectedModelIds: [],
      isLoading: false,
      modelsError: undefined,
      providersError: undefined,
      cloudAvailabilityReady: true,
      cloudAvailabilityError: undefined
    })
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'chat.retry.enabled': true,
      'chat.retry.fallback_model_ids': ['cherryai-subscription::managed-model']
    })

    render(<GeneralSettings />)

    const fallbackTrigger = screen.getByText('settings.models.retry.fallback_models_unavailable').closest('button')
    expect(fallbackTrigger).toBeInTheDocument()
    expect(fallbackTrigger).toHaveAttribute('aria-invalid', 'true')
  })

  it('turns off every tray-dependent preference when the tray is disabled', async () => {
    render(<GeneralSettings />)

    const trayRow = screen.getByText('settings.tray.show').closest<HTMLElement>('[data-testid="setting-row"]')
    expect(trayRow).not.toBeNull()
    fireEvent.click(within(trayRow!).getByRole('switch'))

    await waitFor(() => {
      expect(MockUsePreferenceUtils.getPreferenceValue('app.tray.enabled')).toBe(false)
      expect(MockUsePreferenceUtils.getPreferenceValue('app.tray.on_close')).toBe(false)
      expect(MockUsePreferenceUtils.getPreferenceValue('app.tray.on_launch')).toBe(false)
      expect(MockUsePreferenceUtils.getPreferenceValue('feature.quick_assistant.click_tray_to_show')).toBe(false)
    })
  })

  it('shows the resolved interface language in its own module when no preference is saved', () => {
    MockUsePreferenceUtils.setPreferenceValue('app.language', null)
    render(<GeneralSettings />)

    const languageModule = screen.getByRole('heading', { name: 'common.language' }).closest('section')!
    expect(within(languageModule).getByRole('combobox', { name: '中文' })).toBeInTheDocument()
    expect(within(languageModule).queryByText('settings.general.sections.startup')).not.toBeInTheDocument()
  })

  it('persists a selected interface language and applies it immediately', async () => {
    const user = userEvent.setup()
    MockUsePreferenceUtils.setPreferenceValue('app.language', 'zh-CN')
    render(<GeneralSettings />)

    screen.getByRole('combobox', { name: '中文' }).focus()
    await user.keyboard('{Enter}')
    screen.getByRole('option', { name: /English$/ }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(MockUsePreferenceUtils.getPreferenceValue('app.language')).toBe('en-US'))
    expect(i18nMock.changeLanguage).toHaveBeenCalledWith('en-US')
  })

  it('tests the edited proxy values without persisting them first', async () => {
    const user = userEvent.setup()
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'app.proxy.mode': 'custom',
      'app.proxy.url': 'http://saved.example:8080',
      'app.proxy.bypass_rules': 'localhost'
    })
    render(<GeneralSettings />)

    const proxyUrlInput = screen.getByDisplayValue('http://saved.example:8080')
    const bypassRulesInput = screen.getByDisplayValue('localhost')
    const testButton = screen.getByRole('button', { name: 'settings.proxy.test.action' })

    await user.clear(proxyUrlInput)
    await user.type(proxyUrlInput, 'socks5://edited.example:1080')
    await user.click(testButton)

    await waitFor(() => {
      expect(ipcRequestMock).toHaveBeenCalledWith('proxy.test_connection', {
        mode: 'custom',
        url: 'socks5://edited.example:1080',
        bypassRules: 'localhost'
      })
    })
    expect(MockUsePreferenceUtils.getPreferenceValue('app.proxy.url')).toBe('http://saved.example:8080')

    await user.clear(bypassRulesInput)
    await user.type(bypassRulesInput, 'www.gstatic.com')
    await user.click(testButton)

    await waitFor(() => {
      expect(ipcRequestMock).toHaveBeenLastCalledWith('proxy.test_connection', {
        mode: 'custom',
        url: 'socks5://edited.example:1080',
        bypassRules: 'www.gstatic.com'
      })
    })
    expect(MockUsePreferenceUtils.getPreferenceValue('app.proxy.bypass_rules')).toBe('localhost')
  })

  it('persists edited bypass rules when tabbing to the next setting without testing', async () => {
    const user = userEvent.setup()
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'app.proxy.mode': 'custom',
      'app.proxy.url': 'http://saved.example:8080',
      'app.proxy.bypass_rules': 'localhost'
    })
    render(<GeneralSettings />)

    const bypassRulesInput = screen.getByDisplayValue('localhost')

    await user.clear(bypassRulesInput)
    await user.type(bypassRulesInput, 'www.gstatic.com')
    await user.tab()

    await waitFor(() => {
      expect(MockUsePreferenceUtils.getPreferenceValue('app.proxy.bypass_rules')).toBe('www.gstatic.com')
    })
    expect(ipcRequestMock).not.toHaveBeenCalled()
  })

  it('ignores a deferred result after the proxy input changes and clears results when the mode changes', async () => {
    let resolveRequest: (result: { target: string; route: 'proxy'; success: true }) => void = () => undefined
    const deferredRequest = new Promise<{ target: string; route: 'proxy'; success: true }>((resolve) => {
      resolveRequest = resolve
    })
    ipcRequestMock.mockReturnValueOnce(deferredRequest)
    MockUsePreferenceUtils.setMultiplePreferenceValues({
      'app.proxy.mode': 'custom',
      'app.proxy.url': 'http://old.example:8080',
      'app.proxy.bypass_rules': 'localhost'
    })
    render(<GeneralSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.proxy.test.action' }))
    fireEvent.change(screen.getByDisplayValue('http://old.example:8080'), {
      target: { value: 'http://new.example:8080' }
    })
    resolveRequest({ target: 'https://www.gstatic.com/generate_204', route: 'proxy', success: true })

    await waitFor(() => expect(screen.queryByText('settings.proxy.test.success')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'settings.proxy.test.action' }))
    await waitFor(() => expect(screen.getByText('settings.proxy.test.success')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('settings.proxy.mode.title'), { target: { value: 'none' } })
    expect(screen.queryByText('settings.proxy.test.success')).not.toBeInTheDocument()
  })
})
