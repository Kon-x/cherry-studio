import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Route as MarketplaceRoute } from '@renderer/routes/settings/mcp/marketplaces'

vi.mock('@cherrystudio/ui', async (importOriginal) => importOriginal())
vi.mock('@renderer/hooks/useBuiltinMcpCatalog', () => ({
  useBuiltinMcpCatalog: () => ({ presets: [], mcpServers: [], adding: new Set(), isLoading: false })
}))

beforeEach(async () => {
  await i18next.changeLanguage('en-us')
  vi.stubGlobal('scrollTo', vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('browses MCP picks and sources within settings and restores the selected view from its URL', async () => {
  const user = userEvent.setup()
  const root = createRootRoute()
  const marketplace = createRoute({
    getParentRoute: () => root,
    path: '/settings/mcp/marketplaces',
    validateSearch: MarketplaceRoute.options.validateSearch,
    component: MarketplaceRoute.options.component
  })
  const router = createRouter({
    routeTree: root.addChildren([marketplace]),
    history: createMemoryHistory({ initialEntries: ['/settings/mcp/marketplaces?mcpView=sources'] })
  })
  await router.load()
  render(<RouterProvider router={router} />)

  expect(await screen.findByRole('button', { name: 'More sources' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Configure: ModelScope' })).toBeVisible()
  expect(screen.queryByRole('button', { name: /^Skill/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Agent/ })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Picks' }))
  await waitFor(() => expect(router.state.location.search).toEqual({ mcpView: 'curated' }))
  expect(router.state.location.pathname).toBe('/settings/mcp/marketplaces')
  expect(screen.queryByRole('button', { name: 'Configure: ModelScope' })).not.toBeInTheDocument()

  await act(async () => {
    await router.navigate({ to: '/settings/mcp/marketplaces', search: { mcpView: 'sources' } })
  })
  expect(screen.getByRole('button', { name: 'More sources' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Configure: ModelScope' })).toBeVisible()
})
