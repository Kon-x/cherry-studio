import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'

import MarketplacePage from '@renderer/pages/marketplace/MarketplacePage'

export const Route = createFileRoute('/settings/mcp/marketplaces')({
  validateSearch: z.object({
    mcpView: z.enum(['curated', 'sources']).optional(),
    mcpProvider: z.enum(['bailian', 'modelscope']).optional()
  }),
  component: MarketplacePage
})
