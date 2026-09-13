import { PROVIDER_WEB_SEARCH_TOOL_NAME } from '@shared/ai/builtinTools'
import { describe, expect, it, vi } from 'vitest'

import { getReadableToolActivity } from '../ToolHeader'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => options?.defaultValue ?? key
  })
}))

const translations: Record<string, string> = {
  'message.tools.activity.archive': 'archive',
  'message.tools.activity.assistantTask': 'task',
  'message.tools.activity.availableFeatures': 'available features',
  'message.tools.activity.building': 'Building',
  'message.tools.activity.checking': 'Checking',
  'message.tools.activity.codeFiles': 'program files',
  'message.tools.activity.codeHostInfo': 'online project information',
  'message.tools.activity.configFiles': 'project docs and settings',
  'message.tools.activity.copying': 'Copying',
  'message.tools.activity.currentFolder': 'current folder',
  'message.tools.activity.documentFiles': 'document files',
  'message.tools.activity.downloading': 'Downloading',
  'message.tools.activity.environmentInfo': 'environment information',
  'message.tools.activity.executingCommand': 'Running task',
  'message.tools.activity.file': 'file',
  'message.tools.activity.fileList': 'file list',
  'message.tools.activity.handling': 'Handling',
  'message.tools.activity.installing': 'Installing',
  'message.tools.activity.matchingFiles': 'matching files',
  'message.tools.activity.opening': 'Opening',
  'message.tools.activity.projectDependencies': 'project requirements',
  'message.tools.activity.projectTask': 'project task',
  'message.tools.activity.projectRootFiles': 'top-level project files',
  'message.tools.activity.relatedContent': 'related content',
  'message.tools.activity.repository': 'project content',
  'message.tools.activity.searching': 'Finding',
  'message.tools.activity.starting': 'Starting',
  'message.tools.activity.syncing': 'Syncing',
  'message.tools.activity.taskId': 'Task {{id}}',
  'message.tools.activity.taskList': 'task list',
  'message.tools.activity.viewing': 'Viewing',
  'message.tools.activity.webPage': 'web page',
  'message.tools.sessionCreate.created': 'Started a new session',
  'message.tools.sessionCreate.creating': 'Starting a new session',
  'message.tools.sessionCreate.untitled': 'Untitled session',
  'message.tools.labels.taskCreate': 'Create task',
  'message.tools.labels.taskGet': 'View task',
  'message.tools.labels.taskList': 'List tasks',
  'message.tools.labels.taskOutput': 'View task output',
  'message.tools.labels.taskStop': 'Stop task',
  'message.tools.labels.taskUpdate': 'Update task',
  'message.tools.workflow.orchestrating': 'Orchestrating workflow',
  'message.tools.workflow.started': 'Started workflow',
  'message.tools.workflow.workflow': 'workflow'
}

const t = (key: string, options?: Record<string, string>) => {
  const template = translations[key] ?? key
  if (!options) return template
  return Object.entries(options).reduce((result, [name, value]) => result.replace(`{{${name}}}`, value), template)
}

describe('getReadableToolActivity', () => {
  it('describes provider-executed web search as a web lookup', () => {
    expect(getReadableToolActivity(PROVIDER_WEB_SEARCH_TOOL_NAME, {}, false, t)).toEqual({
      label: 'message.tools.activity.search',
      description: 'related content'
    })
  })
})
