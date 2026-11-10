import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, ScrollArea } from '@cherrystudio/ui'
import { ResourceCatalogSearchInput } from '@renderer/components/resourceCatalog/ResourceCatalogSearchInput'
import { useBuiltinMcpCatalog } from '@renderer/hooks/useBuiltinMcpCatalog'

import { MarketplaceMcp } from './MarketplaceMcp'

const marketplaceRoute = getRouteApi('/settings/mcp/marketplaces')

export default function MarketplacePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { mcpView, mcpProvider } = marketplaceRoute.useSearch()
  const [query, setQuery] = useState('')
  const catalog = useBuiltinMcpCatalog()
  const moreSources = mcpView === 'sources' || Boolean(mcpProvider)

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
      <ResourceCatalogSearchInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('settings.mcp.search.placeholder')}
        aria-label={t('settings.mcp.search.placeholder')}
      />
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant={moreSources ? 'ghost' : 'default'}
          aria-pressed={!moreSources}
          onClick={() =>
            void navigate({ to: '/settings/mcp/marketplaces', search: { mcpView: 'curated' }, replace: true })
          }>
          {t('marketplace.curated')}
        </Button>
        <Button
          size="sm"
          variant={moreSources ? 'default' : 'ghost'}
          aria-pressed={moreSources}
          onClick={() =>
            void navigate({ to: '/settings/mcp/marketplaces', search: { mcpView: 'sources' }, replace: true })
          }>
          {t('marketplace.more_sources')}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1" contentProps={{ className: 'pr-2 pb-4' }}>
        <MarketplaceMcp
          catalog={catalog}
          query={query}
          moreSources={moreSources}
          providerKey={mcpProvider}
          onProviderChange={(providerKey) =>
            void navigate({
              to: '/settings/mcp/marketplaces',
              search: { mcpView: 'sources', mcpProvider: providerKey },
              replace: true
            })
          }
          active
        />
      </ScrollArea>
    </div>
  )
}
