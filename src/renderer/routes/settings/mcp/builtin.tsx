import { createFileRoute, redirect } from '@tanstack/react-router'

export function redirectToMcpCatalog() {
  throw redirect({ to: '/settings/mcp/marketplaces', search: { mcpView: 'curated' } })
}

export const Route = createFileRoute('/settings/mcp/builtin')({ beforeLoad: redirectToMcpCatalog })
