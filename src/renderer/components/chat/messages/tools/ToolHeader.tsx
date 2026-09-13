import { Flex, Tooltip } from '@cherrystudio/ui'
import type { McpToolResponse, NormalToolResponse } from '@renderer/types/mcpTool'
import type { McpTool } from '@renderer/types/tool'
import { PROVIDER_WEB_SEARCH_TOOL_NAME } from '@shared/ai/builtinTools'
import { Globe, ShieldCheck, Wrench } from 'lucide-react'
import type { ComponentPropsWithoutRef, FC, ReactNode } from 'react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { PlaceholderShimmerText } from '../blocks/PlaceholderShimmerText'
import { useOptionalMessageListUi } from '../MessageListProvider'
import { type ToolStatus, ToolStatusIndicator, useIsStreaming } from './shared/GenericTools'

type Translate = (key: string, options?: Record<string, string>) => string
export interface ToolActivity {
  label: string
  description?: string
}

export interface ToolHeaderProps {
  toolResponse?: McpToolResponse | NormalToolResponse

  label?: string
  toolName?: string
  args?: unknown
  icon?: ReactNode
  params?: ReactNode
  stats?: ReactNode

  // Common config
  status?: ToolStatus
  hasError?: boolean
  showStatus?: boolean // default true
  shimmer?: boolean

  // Style variant
  variant?: 'standalone' | 'collapse-label'
}

export const TOOL_HEADER_UI: Record<string, { icon: ReactNode; labelKey?: string }> = {
  [PROVIDER_WEB_SEARCH_TOOL_NAME]: { icon: <Globe size={14} />, labelKey: 'message.tools.labels.webSearch' }
}

const getToolIcon = (toolName: string): ReactNode => TOOL_HEADER_UI[toolName]?.icon ?? <Wrench size={14} />

const getToolLabel = (toolName: string, t: Translate): string => {
  const labelKey = TOOL_HEADER_UI[toolName]?.labelKey
  return labelKey ? t(labelKey) : toolName
}

function getStringArg(args: unknown, key: string): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
  const value = (args as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getReadableFileGroup(text: string | undefined, t: Translate): string | undefined {
  if (!text) return undefined
  const value = text.toLowerCase()
  if (
    value.includes('readme') ||
    value.includes('package.json') ||
    value.includes('go.mod') ||
    value.includes('cargo.toml') ||
    value.includes('tsconfig') ||
    value.includes('.config.')
  ) {
    return t('message.tools.activity.configFiles')
  }
  if (value.includes('*.md') || value.includes('.md') || value.includes('markdown') || value.includes('md files')) {
    return t('message.tools.activity.documentFiles')
  }
  if (/\.(png|jpe?g|gif|webp|svg|ico)\b/.test(value)) {
    return t('message.tools.activity.imageFiles')
  }
  if (value.includes('locales') || value.includes('i18n')) {
    return t('message.tools.activity.translationFiles')
  }
  if (/\.(ts|tsx|js|jsx|json|css|go|rs|py|java|kt|swift|cpp|c|h)\b/.test(value)) {
    return t('message.tools.activity.codeFiles')
  }
  return undefined
}

const SEARCH_PATTERN_META_RE = /[\\^$.*+?()[\]{}|]/

function getReadableSearchTarget(value: string | undefined, t: Translate): string {
  const text = value?.trim()
  if (!text) return t('message.tools.activity.relatedContent')
  const fileGroup = getReadableFileGroup(text, t)
  if (fileGroup) return fileGroup
  if (SEARCH_PATTERN_META_RE.test(text) || text.length > 48) return t('message.tools.activity.relatedContent')
  return text
}

export function getReadableToolActivity(
  toolName: string,
  args: unknown,
  active: boolean,
  t: Translate
): ToolActivity | undefined {
  if (toolName !== PROVIDER_WEB_SEARCH_TOOL_NAME) return undefined
  return {
    label: t(active ? 'message.tools.activity.searching' : 'message.tools.activity.search'),
    description: getReadableSearchTarget(getStringArg(args, 'query'), t)
  }
}

export function getReadableToolDescription(toolName: string, args: unknown, t: Translate): string | undefined {
  return getReadableToolActivity(toolName, args, false, t)?.description
}

function isActiveStatus(status: ToolStatus | undefined): boolean {
  return status === 'pending' || status === 'invoking' || status === 'streaming' || status === 'waiting'
}

const getToolDescription = (toolName: string, args: unknown, t: Translate): string | undefined => {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined

  const readableDescription = getReadableToolDescription(toolName, args, t)
  if (readableDescription) return readableDescription

  // Common description fields
  const argsRecord = args as Record<string, unknown>
  return (
    argsRecord.description ||
    argsRecord.file_path ||
    argsRecord.pattern ||
    argsRecord.query ||
    argsRecord.command ||
    argsRecord.url
  )?.toString()
}

const HeaderContainer = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div
    className={[
      'flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-[13px]',
      className
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
)

// Label variant: no border/padding, for use inside Collapse header
const LabelContainer = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div
    className={['flex min-w-0 max-w-full items-center gap-1 overflow-hidden text-[13px] leading-5', className]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
)

const ToolName = ({ className, ...props }: ComponentPropsWithoutRef<typeof Flex>) => (
  <Flex
    className={['min-w-0 max-w-full shrink items-center overflow-hidden', className].filter(Boolean).join(' ')}
    {...props}
  />
)

const DESCRIPTION_CLASS =
  'inline-block min-w-0 max-w-full shrink truncate font-normal text-[13px] text-muted-foreground'

const Description = ({ className, ...props }: ComponentPropsWithoutRef<'span'>) => (
  <span className={[DESCRIPTION_CLASS, className].filter(Boolean).join(' ')} {...props} />
)

const STATS_CLASS = 'shrink-0 whitespace-nowrap font-normal text-[13px] text-muted-foreground'

const Stats = ({ className, ...props }: ComponentPropsWithoutRef<'span'>) => (
  <span className={[STATS_CLASS, className].filter(Boolean).join(' ')} {...props} />
)

const StatusWrapper = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={['ml-auto flex shrink-0 items-center', className].filter(Boolean).join(' ')} {...props} />
)

function getToolNameClassName(variant: ToolHeaderProps['variant']): string {
  return [
    'items-center gap-1.5',
    variant === 'collapse-label' &&
      'font-normal text-muted-foreground group-hover/tool-group-trigger:text-foreground [&_.tool-icon]:text-foreground-tertiary',
    variant === 'standalone' && 'font-medium text-foreground [&_.tool-icon]:text-primary'
  ]
    .filter(Boolean)
    .join(' ')
}

function getToolIconClassName(isIconBreathing: boolean): string {
  return ['tool-icon inline-flex shrink-0 items-center', isIconBreathing && 'animate-pulse'].filter(Boolean).join(' ')
}

// ============ MCP Tool sub-renderer ============

interface McpToolHeaderProps {
  tool: McpTool
  description?: ReactNode
  stats?: ReactNode
  showStatus: boolean
  status?: ToolStatus
  hasError: boolean
  shimmer: boolean
  Container: typeof HeaderContainer
  variant: ToolHeaderProps['variant']
}

const McpToolHeader: FC<McpToolHeaderProps> = ({
  tool,
  description,
  stats,
  showStatus,
  status,
  hasError,
  shimmer,
  Container,
  variant
}) => {
  const { t } = useTranslation()
  const { isToolAutoApproved } = useOptionalMessageListUi() ?? {}
  const autoApproved = isToolAutoApproved?.(tool) ?? false
  const isIconBreathing = variant === 'collapse-label' && isActiveStatus(status)

  return (
    <Container>
      <ToolName className={getToolNameClassName(variant)}>
        <span className={getToolIconClassName(isIconBreathing)}>
          <Wrench size={14} />
        </span>
        {shimmer ? (
          <PlaceholderShimmerText className="name min-w-0 max-w-full truncate">
            {tool.serverName} : {tool.name}
          </PlaceholderShimmerText>
        ) : (
          <span className="name min-w-0 max-w-full truncate">
            {tool.serverName} : {tool.name}
          </span>
        )}
        {autoApproved && (
          <Tooltip content={t('message.tools.autoApproveEnabled')}>
            <ShieldCheck size={14} color="var(--primary)" />
          </Tooltip>
        )}
      </ToolName>
      {description && <Description>{description}</Description>}
      {stats && <Stats>{stats}</Stats>}
      {showStatus && status && (
        <StatusWrapper>
          <ToolStatusIndicator status={status} hasError={hasError} />
        </StatusWrapper>
      )}
    </Container>
  )
}

// ============ Main Component ============

const ToolHeader: FC<ToolHeaderProps> = ({
  toolResponse,
  label: propLabel,
  toolName: propToolName,
  args: propArgs,
  icon: propIcon,
  params,
  stats,
  status: propStatus,
  hasError: propHasError,
  showStatus = true,
  shimmer = false,
  variant = 'standalone'
}) => {
  const { t } = useTranslation()
  const isStreaming = useIsStreaming()

  const tool = toolResponse?.tool

  const toolName = propToolName || tool?.name || 'Tool'

  const status = propStatus || (toolResponse?.status as ToolStatus)
  const hasError = propHasError ?? toolResponse?.response?.isError === true
  const args = toolResponse?.arguments ?? propArgs
  const activity = getReadableToolActivity(toolName, args, isStreaming || isActiveStatus(status), t)
  const displayLabel = propLabel ?? activity?.label ?? getToolLabel(toolName, t)
  const description = params ?? activity?.description ?? getToolDescription(toolName, args, t)
  const isIconBreathing = variant === 'collapse-label' && isActiveStatus(status)

  const Container = variant === 'standalone' ? HeaderContainer : LabelContainer

  if (tool?.type === 'mcp') {
    return (
      <McpToolHeader
        tool={tool}
        description={description}
        stats={stats}
        showStatus={showStatus}
        status={status}
        hasError={hasError}
        shimmer={shimmer}
        Container={Container}
        variant={variant}
      />
    )
  }

  return (
    <Container>
      <ToolName className={getToolNameClassName(variant)}>
        {variant !== 'collapse-label' && (
          <span className={getToolIconClassName(isIconBreathing)}>{propIcon || getToolIcon(toolName)}</span>
        )}
        {shimmer ? (
          <PlaceholderShimmerText className="name min-w-0 max-w-full truncate">{displayLabel}</PlaceholderShimmerText>
        ) : (
          <span className="name min-w-0 max-w-full truncate">{displayLabel}</span>
        )}
      </ToolName>
      {description && <Description>{description}</Description>}
      {stats && <Stats>{stats}</Stats>}
      {showStatus && status && (
        <StatusWrapper>
          <ToolStatusIndicator status={status} hasError={hasError} />
        </StatusWrapper>
      )}
    </Container>
  )
}

export default memo(ToolHeader)
