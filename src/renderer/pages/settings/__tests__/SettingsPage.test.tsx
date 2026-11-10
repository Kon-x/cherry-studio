import { MockUsePreferenceUtils } from '@test-mocks/renderer/usePreference'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CherryUiModule from '@cherrystudio/ui'
import zhCN from '@renderer/i18n/locales/zh-cn.json'
import { ipcApi } from '@renderer/ipc'

import SettingsPage from '../SettingsPage'

const { isMacTransparentWindowMock, navigateMock, locationMock } = vi.hoisted(() => ({
  isMacTransparentWindowMock: vi.fn(),
  navigateMock: vi.fn(),
  locationMock: { pathname: '/settings/provider' }
}))

vi.mock('@renderer/ipc', () => ({ ipcApi: { request: vi.fn().mockResolvedValue(undefined) } }))

vi.mock('@cherrystudio/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof CherryUiModule>()),
  MenuDivider: () => <hr data-testid="menu-divider" />,
  MenuList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title, action }: { title: string; action?: ReactNode }) => (
    <header>
      {title}
      {action}
    </header>
  ),
  SearchInput: (props: {
    value: string
    placeholder?: string
    onChange: (e: { target: { value: string } }) => void
    onKeyDown?: (e: { key: string; preventDefault: () => void }) => void
  }) => (
    <input
      data-testid="settings-search-input"
      value={props.value}
      placeholder={props.placeholder}
      onChange={props.onChange}
      onKeyDown={props.onKeyDown}
    />
  )
}))

vi.mock('@renderer/hooks/useMacTransparentWindow', () => ({
  default: () => isMacTransparentWindowMock()
}))

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => (
    <>
      <a href="https://open.cherryin.ai" target="_blank" rel="noreferrer">
        <span>Provider website</span>
      </a>
      <a href="#provider">Internal settings</a>
    </>
  ),
  useLocation: () => locationMock,
  useNavigate: () => navigateMock,
  useRouter: () => ({ history: { canGoBack: () => false, back: vi.fn() } }),
  useSearch: () => ({})
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.mcp.tab': 'MCP',
        'selection.name': '划词助手',
        'settings.appearance.title': '外观',
        'settings.dependencies.title': '环境依赖',
        'settings.dependencies.localModels.title': '本地模型',
        'settings.general.common.title': zhCN['settings.general.common.title'],
        'settings.menuGroups.automation': '效率',
        'settings.menuGroups.builtinTools': '内置工具',
        'settings.menuGroups.capabilities': '工具',
        'settings.menuGroups.personal': '偏好',
        'settings.menuGroups.quickAccess': '快捷入口',
        'settings.menuGroups.system': '系统',
        'settings.model': '默认模型',
        'settings.computerUse.title': '电脑操作',
        'settings.browser.title': '浏览器',
        'settings.tool.websearch.title': '网络搜索',
        'settings.prompts.title': '提示词',
        'settings.quickAssistant.title': '快捷助手',
        'settings.scheduledTasks.title': '定时任务',
        'settings.screenshot.title': '截图',
        'settings.shortcuts.title': '快捷键',
        'settings.skills.title': '技能',
        'settings.system.title': '系统',
        'settings.tool.file_processing.features.image_to_text.title': 'OCR',
        'settings.tool.file_processing.features.document_to_markdown.title': '文档处理'
      })[key] ?? key
  })
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    MockUsePreferenceUtils.resetMocks()
    isMacTransparentWindowMock.mockReturnValue(false)
    navigateMock.mockReset()
    locationMock.pathname = '/settings/provider'
    vi.mocked(ipcApi.request).mockClear()
  })

  it('leaves internal settings navigation and right-click menus alone', () => {
    render(<SettingsPage />)
    const internalClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(screen.getByText('Internal settings'), internalClick)
    const rightClick = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 })
    fireEvent(screen.getByText('Provider website'), rightClick)
    expect(internalClick.defaultPrevented).toBe(false)
    expect(rightClick.defaultPrevented).toBe(false)
    expect(ipcApi.request).not.toHaveBeenCalled()
  })

  it('mounts the full-width search field from the header icon only on demand', () => {
    // Off the search page: no field in the DOM, just the quiet header icon
    render(<SettingsPage />)
    expect(screen.queryByTestId('settings-search-input')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.search.placeholder' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'settings.search.placeholder' }))
    expect(screen.getByTestId('settings-search-input')).toBeInTheDocument()

    // Empty-field Escape reports collapse; the page unmounts the field again
    fireEvent.keyDown(screen.getByTestId('settings-search-input'), { key: 'Escape' })
    expect(screen.queryByTestId('settings-search-input')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.search.placeholder' })).toBeInTheDocument()
  })

  it('places General directly above Appearance and local models directly below the default model', () => {
    const { container } = render(<SettingsPage />)

    expect(container.querySelector('[data-ui="settings.view"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="settings.navigation"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="settings.content"]')).toBeInTheDocument()
    expect(screen.getByText('偏好')).toBeInTheDocument()

    const generalItem = screen.getByRole('button', { name: '通用' })
    const appearanceItem = screen.getByRole('button', { name: '外观' })
    const defaultModelItem = screen.getByRole('button', { name: '默认模型' })
    const localModelsItem = screen.getByRole('button', { name: '本地模型' })

    expect(generalItem.nextElementSibling).toBe(appearanceItem)
    expect(defaultModelItem.nextElementSibling).toBe(localModelsItem)
    fireEvent.click(generalItem)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/general' })
    fireEvent.click(localModelsItem)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/local-models' })
  })

  it('keeps document processing and OCR together in tools and dependencies in the system group', () => {
    render(<SettingsPage />)

    expect(screen.getByText('工具')).toBeInTheDocument()

    const dependenciesItem = screen.getByRole('button', { name: '环境依赖' })
    expect(screen.queryByRole('button', { name: '系统' })).not.toBeInTheDocument()
    expect(screen.getByText('系统').nextElementSibling).toBe(dependenciesItem)
    fireEvent.click(dependenciesItem)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/dependencies' })
  })

  it('places built-in tools directly below MCP and opens prompt management', () => {
    render(<SettingsPage />)

    const mcpItem = screen.getByText('MCP').closest('button')
    const promptsItem = screen.getByRole('button', { name: '内置工具' })

    expect(mcpItem).not.toBeNull()
    expect(mcpItem?.nextElementSibling).toBe(promptsItem)
    expect(screen.queryByRole('button', { name: '技能' })).not.toBeInTheDocument()
    fireEvent.click(promptsItem)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/prompts' })
  })

  it('shows the four retained built-in settings destinations in a secondary menu and preserves their routes', () => {
    locationMock.pathname = '/settings/prompts'
    render(<SettingsPage />)
    const menu = within(screen.getByRole('navigation', { name: '内置工具' }))
    const destinations = [
      ['提示词', '/settings/prompts'],
      ['网络搜索', '/settings/websearch'],
      ['文档处理', '/settings/file-processing'],
      ['OCR', '/settings/ocr']
    ]
    expect(menu.getAllByRole('button').map((button) => button.textContent)).toEqual(
      destinations.map(([label]) => label)
    )
    for (const [label, route] of destinations) {
      fireEvent.click(menu.getByRole('button', { name: label }))
      expect(navigateMock).toHaveBeenLastCalledWith({ to: route })
    }
    expect(menu.queryByRole('button', { name: 'MCP' })).not.toBeInTheDocument()
    expect(menu.queryByRole('button', { name: '技能' })).not.toBeInTheDocument()
  })

  it('updates the secondary selection on direct navigation and removes it on other settings pages', () => {
    locationMock.pathname = '/settings/prompts'
    const { rerender } = render(<SettingsPage />)
    const selectedItem = () => within(screen.getByRole('navigation', { name: '内置工具' }))
    expect(selectedItem().getByRole('button', { name: '提示词' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: '内置工具' })).toHaveAttribute('data-active', 'true')

    locationMock.pathname = '/settings/ocr'
    rerender(<SettingsPage />)
    expect(selectedItem().getByRole('button', { name: '提示词' })).not.toHaveAttribute('data-active')
    expect(selectedItem().getByRole('button', { name: 'OCR' })).toHaveAttribute('data-active', 'true')

    locationMock.pathname = '/settings/data'
    rerender(<SettingsPage />)
    expect(screen.queryByRole('navigation', { name: '内置工具' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '内置工具' })).not.toHaveAttribute('data-active')
  })

  it('merges quick access into efficiency and places both assistants last', () => {
    render(<SettingsPage />)

    expect(screen.getByText('效率')).toBeInTheDocument()
    expect(screen.queryByText('快捷入口')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '定时任务' })).not.toBeInTheDocument()

    const efficiencyItems = ['快捷键', '快捷助手', '划词助手', '截图'].map((name) =>
      screen.getByRole('button', { name })
    )
    const menuItems = screen.getAllByRole('button')
    const efficiencyStart = menuItems.indexOf(efficiencyItems[0])

    expect(menuItems.slice(efficiencyStart, efficiencyStart + efficiencyItems.length)).toEqual(efficiencyItems)
    expect(efficiencyItems.at(-1)?.nextElementSibling).toHaveAttribute('data-testid', 'menu-divider')
  })
})
