import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem, MenuList, PageHeader } from '@cherrystudio/ui'
import { McpLogo } from '@renderer/components/icons/SvgIcon'
import {
  settingsSubmenuItemClassName,
  settingsSubmenuItemLabelClassName,
  settingsSubmenuListClassName,
  settingsSubmenuScrollClassName
} from '@renderer/pages/settings/settingsStyles'

export default function McpSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const marketplace = pathname === '/settings/mcp/marketplaces'

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className={`flex flex-col ${settingsSubmenuScrollClassName}`}>
        <PageHeader title={t('settings.mcp.shortTitle')} />
        <MenuList className={settingsSubmenuListClassName}>
          <MenuItem
            id="setting-mcp-servers-tab-servers"
            label={t('settings.mcp.title')}
            active={!marketplace}
            onClick={() => navigate({ to: '/settings/mcp/servers' })}
            icon={<McpLogo width={18} height={18} />}
            className={settingsSubmenuItemClassName}
            labelClassName={settingsSubmenuItemLabelClassName}
          />
          <MenuItem
            id="setting-mcp-marketplaces-tab-marketplaces"
            label={t('settings.mcp.marketplaces')}
            active={marketplace}
            onClick={() => navigate({ to: '/settings/mcp/marketplaces' })}
            icon={<ShoppingBag size={18} />}
            className={settingsSubmenuItemClassName}
            labelClassName={settingsSubmenuItemLabelClassName}
          />
        </MenuList>
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
